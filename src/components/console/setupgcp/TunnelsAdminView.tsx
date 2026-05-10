import {
  ExternalLink,
  Network,
  Play,
  RefreshCw,
  RotateCw,
  Server,
  Square,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/console/shared/EmptyState";
import { ErrorState } from "@/components/console/shared/ErrorState";
import { LoadingState } from "@/components/console/shared/LoadingState";
import type { TunnelInfo } from "@/gateway/platform-client";
import { useTunnelStore } from "@/store/console-stores/tunnel-store";

export function TunnelsAdminView() {
  const { t } = useTranslation("console");
  const tunnels = useTunnelStore((s) => s.tunnels);
  const registryPath = useTunnelStore((s) => s.registryPath);
  const loading = useTunnelStore((s) => s.loading);
  const error = useTunnelStore((s) => s.error);
  const platformAvailable = useTunnelStore((s) => s.platformAvailable);
  const actionInFlight = useTunnelStore((s) => s.actionInFlight);
  const fetchTunnels = useTunnelStore((s) => s.fetchTunnels);
  const startTunnel = useTunnelStore((s) => s.startTunnel);
  const stopTunnel = useTunnelStore((s) => s.stopTunnel);
  const restartTunnel = useTunnelStore((s) => s.restartTunnel);
  const discoverAndRegisterTunnels = useTunnelStore((s) => s.discoverAndRegisterTunnels);

  useEffect(() => {
    void fetchTunnels();
  }, [fetchTunnels]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t("setupGcp.tunnels.title")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("setupGcp.tunnels.description")}
          </p>
          {registryPath && (
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              {t("setupGcp.tunnels.registry")}{" "}
              <span className="font-mono">{registryPath}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void discoverAndRegisterTunnels()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Network className="h-3.5 w-3.5" />
            {t("setupGcp.tunnels.actions.discoverRegister")}
          </button>
          <button
            type="button"
            onClick={() => fetchTunnels()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("setupGcp.actions.refresh")}
          </button>
        </div>
      </div>

      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200">
        <p className="font-medium">{t("setupGcp.tunnels.banner.title")}</p>
        <p className="mt-1 text-xs leading-relaxed">{t("setupGcp.tunnels.banner.body")}</p>
      </div>

      {loading && tunnels.length === 0 ? (
        <LoadingState />
      ) : error && tunnels.length === 0 ? (
        <ErrorState
          message={
            platformAvailable ? error : `${t("setupGcp.tunnels.platformUnavailable")} ${error}`
          }
          onRetry={() => fetchTunnels()}
        />
      ) : tunnels.length === 0 ? (
        <EmptyState
          icon={Network}
          title={t("setupGcp.tunnels.empty.title")}
          description={t("setupGcp.tunnels.empty.description")}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {tunnels.map((tunnel) => (
            <TunnelCard
              key={tunnel.id}
              tunnel={tunnel}
              busy={Boolean(actionInFlight[tunnel.id])}
              busyAction={actionInFlight[tunnel.id]}
              onStart={() => startTunnel(tunnel.id)}
              onStop={() => stopTunnel(tunnel.id)}
              onRestart={() => restartTunnel(tunnel.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface TunnelCardProps {
  tunnel: TunnelInfo;
  busy: boolean;
  busyAction?: string;
  onStart: () => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onRestart: () => Promise<boolean>;
}

function TunnelCard({
  tunnel,
  busy,
  busyAction,
  onStart,
  onStop,
  onRestart,
}: TunnelCardProps) {
  const { t } = useTranslation("console");
  const canStop = tunnel.running && tunnel.managed;
  const canRestart = !tunnel.running || tunnel.managed;
  const target = `${tunnel.instance ?? tunnel.kind}:${tunnel.remoteHost}:${tunnel.remotePort}`;

  return (
    <li className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          <Server className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {tunnel.label}
            </span>
            <StatusPill tunnel={tunnel} />
            {tunnel.autostart && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                {t("setupGcp.tunnels.autostart")}
              </span>
            )}
            {tunnel.source === "shell" && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                {t("setupGcp.tunnels.detected")}
              </span>
            )}
          </div>
          {tunnel.description && (
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {tunnel.description}
            </p>
          )}
          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p>
              <span className="font-medium text-gray-600 dark:text-gray-300">
                {t("setupGcp.tunnels.local")}
              </span>{" "}
              <a
                href={tunnel.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline dark:text-blue-300"
              >
                {tunnel.url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p className="truncate">
              <span className="font-medium text-gray-600 dark:text-gray-300">
                {t("setupGcp.tunnels.target")}
              </span>{" "}
              <span className="font-mono">{target}</span>
            </p>
            {tunnel.pid && (
              <p>
                <span className="font-medium text-gray-600 dark:text-gray-300">PID</span>{" "}
                <span className="font-mono">{tunnel.pid}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || tunnel.running}
          onClick={() => void onStart()}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {busyAction === "start" ? t("setupGcp.tunnels.actions.starting") : t("setupGcp.tunnels.actions.start")}
        </button>
        <button
          type="button"
          disabled={busy || !canStop}
          onClick={() => void onStop()}
          title={!canStop && tunnel.running ? t("setupGcp.tunnels.unmanagedHint") : undefined}
          className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Square className="h-3.5 w-3.5" />
          {busyAction === "stop" ? t("setupGcp.tunnels.actions.stopping") : t("setupGcp.tunnels.actions.stop")}
        </button>
        <button
          type="button"
          disabled={busy || !canRestart}
          onClick={() => void onRestart()}
          title={!canRestart ? t("setupGcp.tunnels.unmanagedHint") : undefined}
          className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RotateCw className={`h-3.5 w-3.5 ${busyAction === "restart" ? "animate-spin" : ""}`} />
          {busyAction === "restart"
            ? t("setupGcp.tunnels.actions.restarting")
            : t("setupGcp.tunnels.actions.restart")}
        </button>
      </div>
    </li>
  );
}

function StatusPill({ tunnel }: { tunnel: TunnelInfo }) {
  const { t } = useTranslation("console");
  const classes =
    tunnel.status === "running"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : tunnel.status === "active-unmanaged"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${classes}`}>
      {t(`setupGcp.tunnels.status.${tunnel.status}`)}
    </span>
  );
}
