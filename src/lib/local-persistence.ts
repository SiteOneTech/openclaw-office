import type { ChatDockMessage } from "@/store/console-stores/chat-dock-store";
import type { SessionInfo } from "@/gateway/adapter-types";
import type { EventHistoryItem } from "@/gateway/types";

interface LocalPersistenceOptions {
  dbName?: string;
  version?: number;
  maxMessagesPerSession?: number;
  maxEvents?: number;
  messageExpireDays?: number;
  eventExpireDays?: number;
}

interface StoredChatMessage extends ChatDockMessage {
  sessionKey: string;
}

interface StoredSessionInfo extends SessionInfo {
  cachedAt: number;
}

const DEFAULT_DB_NAME = "openclaw-office-cache";
const DEFAULT_VERSION = 2;
const DEFAULT_MAX_MESSAGES_PER_SESSION = 500;
const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_MESSAGE_EXPIRE_DAYS = 30;
const DEFAULT_EVENT_EXPIRE_DAYS = 7;
const QUOTA_THRESHOLD = 0.8;

const STORE_CHAT = "chat_messages";
const STORE_EVENTS = "event_history";
const STORE_SESSIONS = "chat_sessions";

class LocalPersistence {
  private db: IDBDatabase | null = null;
  private available = true;
  private readonly dbName: string;
  private readonly version: number;
  private readonly maxMessagesPerSession: number;
  private readonly maxEvents: number;
  private readonly messageExpireDays: number;
  private readonly eventExpireDays: number;

  constructor(options?: LocalPersistenceOptions) {
    this.dbName = options?.dbName ?? DEFAULT_DB_NAME;
    this.version = options?.version ?? DEFAULT_VERSION;
    this.maxMessagesPerSession = options?.maxMessagesPerSession ?? DEFAULT_MAX_MESSAGES_PER_SESSION;
    this.maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.messageExpireDays = options?.messageExpireDays ?? DEFAULT_MESSAGE_EXPIRE_DAYS;
    this.eventExpireDays = options?.eventExpireDays ?? DEFAULT_EVENT_EXPIRE_DAYS;
  }

  async open(): Promise<void> {
    if (this.db) return;
    try {
      if (typeof indexedDB === "undefined") {
        this.available = false;
        return;
      }
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_CHAT)) {
            const chatStore = db.createObjectStore(STORE_CHAT, { keyPath: "id" });
            chatStore.createIndex("sessionKey", "sessionKey", { unique: false });
            chatStore.createIndex("timestamp", "timestamp", { unique: false });
            chatStore.createIndex("session_time", ["sessionKey", "timestamp"], { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            const eventStore = db.createObjectStore(STORE_EVENTS, { autoIncrement: true });
            eventStore.createIndex("timestamp", "timestamp", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: "key" });
            sessionStore.createIndex("lastActiveAt", "lastActiveAt", { unique: false });
            sessionStore.createIndex("cachedAt", "cachedAt", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      this.available = false;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- Chat Messages ---

  async getMessages(sessionKey: string): Promise<ChatDockMessage[]> {
    if (!this.canOperate()) return [];
    try {
      const tx = this.db!.transaction(STORE_CHAT, "readonly");
      const store = tx.objectStore(STORE_CHAT);
      const index = store.index("session_time");
      const range = IDBKeyRange.bound([sessionKey, 0], [sessionKey, Number.MAX_SAFE_INTEGER]);
      const results = await idbRequest<StoredChatMessage[]>(index.getAll(range));
      return results.map(({ sessionKey: _sk, ...msg }) => msg);
    } catch {
      return [];
    }
  }

  async saveMessage(sessionKey: string, msg: ChatDockMessage): Promise<void> {
    if (!this.canOperate()) return;
    try {
      if (await this.isQuotaExceeded()) return;
      const stored: StoredChatMessage = { ...msg, sessionKey };
      const tx = this.db!.transaction(STORE_CHAT, "readwrite");
      tx.objectStore(STORE_CHAT).put(stored);
      await idbTransaction(tx);
      await this.enforceMessageLimit(sessionKey);
    } catch {
      // silent
    }
  }

  async saveMessages(sessionKey: string, msgs: ChatDockMessage[]): Promise<void> {
    if (!this.canOperate() || msgs.length === 0) return;
    try {
      if (await this.isQuotaExceeded()) return;

      // Clear existing messages for this session, then write new batch
      const clearTx = this.db!.transaction(STORE_CHAT, "readwrite");
      const clearStore = clearTx.objectStore(STORE_CHAT);
      const clearIndex = clearStore.index("sessionKey");
      const keysToDelete = await idbRequest<IDBValidKey[]>(clearIndex.getAllKeys(sessionKey));
      for (const key of keysToDelete) {
        clearStore.delete(key);
      }
      await idbTransaction(clearTx);

      // Write new messages
      const writeTx = this.db!.transaction(STORE_CHAT, "readwrite");
      const writeStore = writeTx.objectStore(STORE_CHAT);
      const limited = msgs.slice(-this.maxMessagesPerSession);
      for (const msg of limited) {
        writeStore.put({ ...msg, sessionKey } as StoredChatMessage);
      }
      await idbTransaction(writeTx);
    } catch {
      // silent
    }
  }

  async clearMessages(sessionKey: string): Promise<void> {
    if (!this.canOperate()) return;
    try {
      const tx = this.db!.transaction(STORE_CHAT, "readwrite");
      const store = tx.objectStore(STORE_CHAT);
      const index = store.index("sessionKey");
      const keys = await idbRequest<IDBValidKey[]>(index.getAllKeys(sessionKey));
      for (const key of keys) {
        store.delete(key);
      }
      await idbTransaction(tx);
    } catch {
      // silent
    }
  }

  // --- Session History ---

  async getSessions(): Promise<{ sessions: SessionInfo[]; cachedAt: number | null }> {
    if (!this.canOperate()) return { sessions: [], cachedAt: null };
    try {
      const tx = this.db!.transaction(STORE_SESSIONS, "readonly");
      const store = tx.objectStore(STORE_SESSIONS);
      const all = await idbRequest<StoredSessionInfo[]>(store.getAll());
      all.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
      return {
        sessions: all.map(({ cachedAt: _cachedAt, ...session }) => session),
        cachedAt: all[0]?.cachedAt ?? null,
      };
    } catch {
      return { sessions: [], cachedAt: null };
    }
  }

  async saveSessions(sessions: SessionInfo[]): Promise<void> {
    if (!this.canOperate()) return;
    try {
      if (await this.isQuotaExceeded()) return;
      const now = Date.now();
      const tx = this.db!.transaction(STORE_SESSIONS, "readwrite");
      const store = tx.objectStore(STORE_SESSIONS);
      store.clear();
      for (const session of sessions) {
        store.put({ ...session, cachedAt: now } as StoredSessionInfo);
      }
      await idbTransaction(tx);
    } catch {
      // silent
    }
  }

  async clearSessions(): Promise<void> {
    if (!this.canOperate()) return;
    try {
      const tx = this.db!.transaction(STORE_SESSIONS, "readwrite");
      tx.objectStore(STORE_SESSIONS).clear();
      await idbTransaction(tx);
    } catch {
      // silent
    }
  }

  // --- Event History ---

  async getEvents(limit?: number): Promise<EventHistoryItem[]> {
    if (!this.canOperate()) return [];
    try {
      const tx = this.db!.transaction(STORE_EVENTS, "readonly");
      const store = tx.objectStore(STORE_EVENTS);
      const all = await idbRequest<EventHistoryItem[]>(store.getAll());
      all.sort((a, b) => a.timestamp - b.timestamp);
      if (limit && all.length > limit) {
        return all.slice(-limit);
      }
      return all;
    } catch {
      return [];
    }
  }

  async saveEvent(event: EventHistoryItem): Promise<void> {
    if (!this.canOperate()) return;
    try {
      if (await this.isQuotaExceeded()) return;
      const tx = this.db!.transaction(STORE_EVENTS, "readwrite");
      tx.objectStore(STORE_EVENTS).add(event);
      await idbTransaction(tx);
      await this.enforceEventLimit();
    } catch {
      // silent
    }
  }

  async saveEvents(events: EventHistoryItem[]): Promise<void> {
    if (!this.canOperate() || events.length === 0) return;
    try {
      if (await this.isQuotaExceeded()) return;
      const tx = this.db!.transaction(STORE_EVENTS, "readwrite");
      const store = tx.objectStore(STORE_EVENTS);
      for (const event of events) {
        store.add(event);
      }
      await idbTransaction(tx);
      await this.enforceEventLimit();
    } catch {
      // silent
    }
  }

  async clearEvents(): Promise<void> {
    if (!this.canOperate()) return;
    try {
      const tx = this.db!.transaction(STORE_EVENTS, "readwrite");
      tx.objectStore(STORE_EVENTS).clear();
      await idbTransaction(tx);
    } catch {
      // silent
    }
  }

  // --- Maintenance ---

  async cleanup(): Promise<void> {
    if (!this.canOperate()) return;
    try {
      const now = Date.now();
      const messageExpireMs = this.messageExpireDays * 24 * 60 * 60 * 1000;
      const eventExpireMs = this.eventExpireDays * 24 * 60 * 60 * 1000;

      // Clean expired chat messages
      const chatTx = this.db!.transaction(STORE_CHAT, "readwrite");
      const chatStore = chatTx.objectStore(STORE_CHAT);
      const chatIndex = chatStore.index("timestamp");
      const expiredRange = IDBKeyRange.upperBound(now - messageExpireMs);
      const expiredKeys = await idbRequest<IDBValidKey[]>(chatIndex.getAllKeys(expiredRange));
      for (const key of expiredKeys) {
        chatStore.delete(key);
      }
      await idbTransaction(chatTx);

      // Clean expired events
      const eventTx = this.db!.transaction(STORE_EVENTS, "readwrite");
      const eventStore = eventTx.objectStore(STORE_EVENTS);
      const eventIndex = eventStore.index("timestamp");
      const expiredEventRange = IDBKeyRange.upperBound(now - eventExpireMs);
      const expiredEventKeys = await idbRequest<IDBValidKey[]>(eventIndex.getAllKeys(expiredEventRange));
      for (const key of expiredEventKeys) {
        eventStore.delete(key);
      }
      await idbTransaction(eventTx);
    } catch {
      // silent
    }
  }

  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
      }
    } catch {
      // silent
    }
    return { usage: 0, quota: 0 };
  }

  // --- Private helpers ---

  private canOperate(): boolean {
    return this.available && this.db !== null;
  }

  private async isQuotaExceeded(): Promise<boolean> {
    try {
      const { usage, quota } = await this.getStorageEstimate();
      if (quota > 0 && usage / quota > QUOTA_THRESHOLD) {
        await this.cleanup();
        const after = await this.getStorageEstimate();
        return after.quota > 0 && after.usage / after.quota > QUOTA_THRESHOLD;
      }
    } catch {
      // silent
    }
    return false;
  }

  private async enforceMessageLimit(sessionKey: string): Promise<void> {
    try {
      const tx = this.db!.transaction(STORE_CHAT, "readwrite");
      const store = tx.objectStore(STORE_CHAT);
      const index = store.index("session_time");
      const range = IDBKeyRange.bound([sessionKey, 0], [sessionKey, Number.MAX_SAFE_INTEGER]);
      const allKeys = await idbRequest<IDBValidKey[]>(index.getAllKeys(range));
      if (allKeys.length > this.maxMessagesPerSession) {
        const toDelete = allKeys.slice(0, allKeys.length - this.maxMessagesPerSession);
        for (const key of toDelete) {
          store.delete(key);
        }
        await idbTransaction(tx);
      }
    } catch {
      // silent
    }
  }

  private async enforceEventLimit(): Promise<void> {
    try {
      const tx = this.db!.transaction(STORE_EVENTS, "readwrite");
      const store = tx.objectStore(STORE_EVENTS);
      const count = await idbRequest<number>(store.count());
      if (count > this.maxEvents) {
        const toRemove = count - this.maxEvents;
        const cursor = store.openCursor();
        let removed = 0;
        await new Promise<void>((resolve, reject) => {
          cursor.onsuccess = () => {
            const result = cursor.result;
            if (result && removed < toRemove) {
              result.delete();
              removed++;
              result.continue();
            } else {
              resolve();
            }
          };
          cursor.onerror = () => reject(cursor.error);
        });
      }
    } catch {
      // silent
    }
  }
}

// --- IndexedDB Promise helpers ---

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const localPersistence = new LocalPersistence();

export { LocalPersistence };
export type { LocalPersistenceOptions, StoredChatMessage };
