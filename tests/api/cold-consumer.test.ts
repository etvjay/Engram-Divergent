import { afterEach, describe, expect, it } from "vitest";
import { Server } from "node:http";
import { pathToFileURL } from "node:url";

let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; });

describe("compiled package cold consumer", () => {
  it("imports the build output and completes a loopback request", async () => {
    // The cold consumer intentionally imports the compiled package boundary.
    const compiled = await import(pathToFileURL(`${process.cwd()}/dist/packages/agent-surface/src/http.js`).href);
    const surface = { call: async () => ({ status: "ADMITTED" }) } as never;
    server = compiled.createRestServer({ surface });
    const address = await compiled.listenRestServer(server);
    const response = await fetch(`http://${address.host}:${address.port}/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ evidence: "LOCAL_LOOPBACK" });
  });
});
