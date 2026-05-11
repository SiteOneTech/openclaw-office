export interface OpenClawRuntimeConfig {
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayWsPath?: string;
  registryApiUrl?: string;
  officeTitle?: string;
  branchLabel?: string;
  baseCommit?: string;
  officeUpdateMode?: "gateway" | "fork-capablanca";
}

export const DEFAULT_OFFICE_TITLE = "SitioUno Office";

export function getRuntimeConfig(): OpenClawRuntimeConfig {
  return ((window as unknown as Record<string, unknown>).__OPENCLAW_CONFIG__ ??
    {}) as OpenClawRuntimeConfig;
}

export function getOfficeTitle(): string {
  return getRuntimeConfig().officeTitle || import.meta.env.VITE_OFFICE_TITLE || DEFAULT_OFFICE_TITLE;
}

export function getBranchLabel(fallback = ""): string {
  return getRuntimeConfig().branchLabel || import.meta.env.VITE_BRANCH_LABEL || fallback;
}

export function getBaseCommit(fallback = ""): string {
  return getRuntimeConfig().baseCommit || fallback;
}

export function getOfficeUpdateMode(): "gateway" | "fork-capablanca" {
  const mode = getRuntimeConfig().officeUpdateMode;
  return mode === "fork-capablanca" ? mode : "gateway";
}

export function normalizeBranchDisplayName(value: string): string {
  const branch = value.trim();
  if (!branch) {
    return "";
  }
  if (/[A-Z]/.test(branch) || branch.includes(" ")) {
    return branch;
  }
  return branch
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatOfficeNeonLabel(officeTitle: string, branchLabel: string): string {
  const title = (officeTitle.trim() || DEFAULT_OFFICE_TITLE).toUpperCase();
  const branch = normalizeBranchDisplayName(branchLabel).toUpperCase();
  return branch ? `${title} - ${branch}` : title;
}
