import { useEffect, type RefObject } from "react";
import type { GatewayWsClient } from "@/gateway/ws-client";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";
import { useOfficeStore } from "@/store/office-store";

interface ChatWorkspaceBootstrapProps {
  wsClient?: RefObject<GatewayWsClient | null>;
}

export function ChatWorkspaceBootstrap({ wsClient }: ChatWorkspaceBootstrapProps) {
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const agents = useOfficeStore((s) => s.agents);
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const initEventListeners = useChatDockStore((s) => s.initEventListeners);
  const setTargetAgent = useChatDockStore((s) => s.setTargetAgent);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    const client = wsClient?.current ?? null;
    if (!client) return;
    return initEventListeners(client);
  }, [connectionStatus, wsClient, initEventListeners]);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      return;
    }
    const currentTarget = useChatDockStore.getState().targetAgentId;
    if (currentTarget) {
      return;
    }
    const preferredAgentId =
      selectedAgentId && !agents.get(selectedAgentId)?.isSubAgent
        ? selectedAgentId
        : Array.from(agents.values()).find((agent) => !agent.isSubAgent)?.id ?? "main";
    setTargetAgent(preferredAgentId);
  }, [connectionStatus, agents, selectedAgentId, setTargetAgent]);

  useEffect(() => {
    if (!selectedAgentId) return;
    const agent = agents.get(selectedAgentId);
    if (!agent || agent.isSubAgent) return;
    const currentTarget = useChatDockStore.getState().targetAgentId;
    if (currentTarget !== selectedAgentId) {
      setTargetAgent(selectedAgentId);
    }
  }, [selectedAgentId, agents, setTargetAgent]);

  return null;
}
