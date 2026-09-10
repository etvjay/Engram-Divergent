import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../../packages/agent-surface/src/http.js";

describe("OpenAPI route contract", () => {
  it("exactly covers the exported route matrix", () => {
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), "packages/agent-surface/openapi.json"), "utf8")) as { paths: Record<string, Record<string, { [key: string]: unknown }>> };
    const documented = Object.entries(spec.paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`));
    const matrix = ["GET /v1/health", "GET /v1/capabilities", ...ROUTES.map((route) => `${route.method} ${route.path}`)];
    expect(documented.sort()).toEqual(matrix.sort());
    for (const route of ROUTES) expect(spec.paths[route.path]?.[route.method.toLowerCase()]?.["x-classification"]).toBe(route.classification);
    expect(spec.paths["/v1/health"]?.get?.["x-classification"]).toBe("read");
    expect(spec.paths["/v1/capabilities"]?.get?.["x-classification"]).toBe("read");
  });
});
