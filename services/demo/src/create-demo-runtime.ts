import type { EngramRuntime } from "../../../packages/runtime/src/runtime.js";
import { createEngramRuntime } from "../../runtime/src/create-runtime.js";
import { DEMO_RUNTIME_POLICIES } from "./runtime-policy.js";

let demoRuntime: EngramRuntime | undefined;

export function getEngramDemoRuntime(): EngramRuntime {
  if (!demoRuntime) demoRuntime = createEngramRuntime(DEMO_RUNTIME_POLICIES);
  return demoRuntime;
}
