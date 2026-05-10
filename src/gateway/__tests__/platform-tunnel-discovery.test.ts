// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractForwardTunnels, parseForwardSpec } from "../../../bin/platform-tunnel-discovery.js";

describe("platform tunnel discovery", () => {
  it("parses local SSH forward specs", () => {
    expect(parseForwardSpec("127.0.0.1:9119:10.0.0.2:443")).toEqual({
      localHost: "127.0.0.1",
      localPort: 9119,
      remoteHost: "10.0.0.2",
      remotePort: 443,
    });
    expect(parseForwardSpec("9120:127.0.0.1:8781")).toEqual({
      localHost: "127.0.0.1",
      localPort: 9120,
      remoteHost: "127.0.0.1",
      remotePort: 8781,
    });
  });

  it("extracts informational tunnels from local process commands", () => {
    const tunnels = extractForwardTunnels(
      1234,
      "gcloud compute ssh openclaw-gateway-01 -- -N -L 127.0.0.1:9119:127.0.0.1:8781",
    );

    expect(tunnels).toEqual([
      expect.objectContaining({
        id: "detected-127.0.0.1-9119-127.0.0.1-8781",
        kind: "detected-local",
        localHost: "127.0.0.1",
        localPort: 9119,
        remoteHost: "127.0.0.1",
        remotePort: 8781,
        source: "shell",
        pid: 1234,
      }),
    ]);
  });
});
