import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  Play,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useServiceStore } from "@/store/console-stores/service-store";

export function ServiceSection() {
  const { t } = useTranslation("console");
  const serviceStatus = useServiceStore((s) => s.serviceStatus);
  const platformAvailable = useServiceStore((s) => s.platformAvailable);
  const loading = useServiceStore((s) => s.loading);
  const error = useServiceStore((s) => s.error);
  const checkPlatform = useServiceStore((s) => s.checkPlatform);
  const fetchStatus = useServiceStore((s) => s.fetchStatus);
  const startService = useServiceStore((s) => s.startService);
  const stopService = useServiceStore((s) => s.stopService);
  const restartService = useServiceStore((s) => s.restartService);
  const installService = useServiceStore((s) => s.installService);

  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  useEffect(() => {
    void checkPlatform().then(() => {
      if (useServiceStore.getState().platformAvailable) {
        void fetchStatus();
      }
    });
  }, [checkPlatform, fetchStatus]);

  if (!platformAvailable) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-900/20">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {t("settings.service.platformUnavailable")}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {t("settings.service.platformUnavailableHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRunning = serviceStatus?.running === true;
  const isInstalled = serviceStatus?.installed === true;
  const anyLoading = Object.values(loading).some(Boolean);

  function handleAction(action: string, fn: () => Promise<boolean>) {
    const needsConfirm = ["stop", "restart"].includes(action);
    if (needsConfirm && confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setConfirmAction(null);
    void fn();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t("settings.service.title")}
        </h3>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          disabled={loading.fetchStatus}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading.fetchStatus ? "animate-spin" : ""}`} />
          {loading.fetchStatus
            ? t("settings.service.fetchingStatus")
            : t("settings.gateway.refresh")}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Status info grid */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusItem
          label={t("settings.service.status")}
          value={
            isRunning
              ? t("settings.service.running")
              : serviceStatus
                ? t("settings.service.stopped")
                : t("settings.service.unknown")
          }
          icon={
            isRunning ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : serviceStatus ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400" />
            )
          }
        />
        <StatusItem
          label={t("settings.service.installStatus")}
          value={
            isInstalled
              ? t("settings.service.installed")
              : t("settings.service.notInstalled")
          }
        />
        {serviceStatus?.pid != null && (
          <StatusItem label={t("settings.service.pid")} value={String(serviceStatus.pid)} />
        )}
        {serviceStatus?.port != null && (
          <StatusItem label={t("settings.service.port")} value={String(serviceStatus.port)} />
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {confirmAction === "stop" && t("settings.service.confirmStop")}
            {confirmAction === "restart" && t("settings.service.confirmRestart")}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const actions: Record<string, () => Promise<boolean>> = {
                  stop: stopService,
                  restart: restartService,
                };
                const fn = actions[confirmAction];
                if (fn) {
                  setConfirmAction(null);
                  void fn();
                }
              }}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              {t("common:confirm", { defaultValue: "Confirm" })}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            >
              {t("common:cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </div>
      )}

      {/* Service control buttons */}
      <div className="flex flex-wrap gap-2">
        {!isRunning && (
          <ActionButton
            icon={<Play className="h-3.5 w-3.5" />}
            label={loading.start ? t("settings.service.starting") : t("settings.service.start")}
            loading={loading.start}
            disabled={anyLoading}
            onClick={() => handleAction("start", startService)}
            variant="green"
          />
        )}
        {isRunning && (
          <>
            <ActionButton
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              label={
                loading.restart
                  ? t("settings.service.restarting")
                  : t("settings.service.restart")
              }
              loading={loading.restart}
              disabled={anyLoading}
              onClick={() => handleAction("restart", restartService)}
              variant="blue"
            />
            <ActionButton
              icon={<Square className="h-3.5 w-3.5" />}
              label={loading.stop ? t("settings.service.stopping") : t("settings.service.stop")}
              loading={loading.stop}
              disabled={anyLoading}
              onClick={() => handleAction("stop", stopService)}
              variant="red"
            />
          </>
        )}
      </div>

      {/* Install section */}
      {!isInstalled && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {t("settings.service.installHint")}
          </p>
          <ActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={
              loading.install
                ? t("settings.service.installing")
                : t("settings.service.install")
            }
            loading={loading.install}
            disabled={anyLoading}
            onClick={() => void installService()}
            variant="default"
          />
        </div>
      )}
    </div>
  );
}

function StatusItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "green" | "blue" | "red";
}) {
  const variantClasses = {
    default:
      "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700",
    green:
      "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20",
    blue:
      "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20",
    red:
      "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors ${variantClasses[variant]}`}
    >
      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
