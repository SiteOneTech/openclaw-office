import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFICE_TITLE,
  formatOfficeNeonLabel,
  normalizeBranchDisplayName,
} from "@/lib/runtime-config";

describe("runtime-config office branding", () => {
  it("uses SitioUno Office as the canonical default title", () => {
    expect(DEFAULT_OFFICE_TITLE).toBe("SitioUno Office");
  });

  it("formats the neon label with the canonical office and branch display name", () => {
    expect(formatOfficeNeonLabel("SitioUno Office", "Sicilia")).toBe("SITIOUNO OFFICE - SICILIA");
  });

  it("normalizes technical branch ids when registry display_name is unavailable", () => {
    expect(normalizeBranchDisplayName("sicilia")).toBe("Sicilia");
    expect(formatOfficeNeonLabel("SitioUno Office", "miami")).toBe("SITIOUNO OFFICE - MIAMI");
  });
});
