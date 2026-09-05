import type {
  RuntimeCompleteInput,
  RuntimeCompleteResult,
  RuntimeDecisionInput,
  RuntimeDecisionRecord,
  RuntimeObservationInput,
  RuntimeRecallResult,
} from "../../runtime/src/types.js";
import type { EngramRuntime } from "../../runtime/src/runtime.js";
import type { ExecutionContext } from "../../memory-core/src/domain.js";

export type RecallInput = {
  query: string;
  status?: Array<"SUCCESS" | "FAILURE" | "PARTIAL" | "COMPENSATED" | "ABORTED" | "UNKNOWN">;
};

export type DecisionInput = Omit<RuntimeDecisionInput, "executionId">;
export type ObservationInput = Omit<RuntimeObservationInput, "executionId">;
export type CompleteInput = Omit<RuntimeCompleteInput, "executionId">;

export interface EngramTransport {
  startExecution(input: ExecutionContext): Promise<{ executionId: string }>;
  recall(executionId: string, input: RecallInput): Promise<RuntimeRecallResult>;
  recordDecision(executionId: string, input: DecisionInput): Promise<RuntimeDecisionRecord>;
  observe(executionId: string, input: ObservationInput): Promise<void>;
  complete(executionId: string, input: CompleteInput): Promise<RuntimeCompleteResult>;
  trace(executionId: string): Promise<unknown>;
}

export class Engram {
  constructor(private readonly transport: EngramTransport) {}

  async startExecution(input: ExecutionContext): Promise<EngramExecution> {
    const { executionId } = await this.transport.startExecution(input);
    return new EngramExecution(executionId, this.transport);
  }

  execution(executionId: string): EngramExecution {
    return new EngramExecution(executionId, this.transport);
  }
}

export class EngramExecution {
  constructor(
    readonly id: string,
    private readonly transport: EngramTransport,
  ) {}

  recall(input: RecallInput): Promise<RuntimeRecallResult> {
    return this.transport.recall(this.id, input);
  }

  recordDecision(input: DecisionInput): Promise<RuntimeDecisionRecord> {
    return this.transport.recordDecision(this.id, input);
  }

  observe(input: ObservationInput): Promise<void> {
    return this.transport.observe(this.id, input);
  }

  complete(input: CompleteInput): Promise<RuntimeCompleteResult> {
    return this.transport.complete(this.id, input);
  }

  trace(): Promise<unknown> {
    return this.transport.trace(this.id);
  }
}

/** Embedded transport for runtimes that want Engram in-process. */
export function runtimeTransport(runtime: EngramRuntime): EngramTransport {
  return {
    startExecution: (input) => runtime.startExecution(input),
    recall: (executionId, input) => runtime.recall({ executionId, ...input }),
    recordDecision: (executionId, input) => runtime.recordDecision({ executionId, ...input }),
    observe: (executionId, input) => runtime.observe({ executionId, ...input }),
    complete: (executionId, input) => runtime.complete({ executionId, ...input }),
    trace: (executionId) => runtime.trace(executionId),
  };
}

export {
  EngramHttpError,
  httpTransport,
  type HttpTransportOptions,
} from "./http.js";
