type StoredIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
};

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

const STORAGE_KEY = "openclaw-office.device-identity.v1";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(publicKey));
  return bytesToHex(new Uint8Array(hash));
}

async function generateIdentity(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  return {
    deviceId: await fingerprintPublicKey(publicKey),
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const derivedDeviceId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedDeviceId !== parsed.deviceId) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              ...parsed,
              deviceId: derivedDeviceId,
            } satisfies StoredIdentity),
          );
          return {
            deviceId: derivedDeviceId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // Ignore invalid local state and regenerate.
  }

  const identity = await generateIdentity();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
      createdAtMs: Date.now(),
    } satisfies StoredIdentity),
  );
  return identity;
}

export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(base64UrlDecode(privateKeyBase64Url)),
    "Ed25519",
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}
