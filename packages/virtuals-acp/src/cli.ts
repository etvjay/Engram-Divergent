import { spawn } from "node:child_process";

export type AcpCliResult = {
  stdout: string;
  stderr: string;
  json: unknown;
};

function commandPrefix(): { command: string; args: string[] } {
  const configured = process.env.ENGRAM_ACP_BIN?.trim();
  if (configured) return { command: configured, args: [] };
  return { command: "npx", args: ["--yes", "@virtuals-protocol/acp-cli"] };
}

export async function runAcpJson(args: string[], options: { testnet?: boolean } = {}): Promise<AcpCliResult> {
  const prefix = commandPrefix();
  const commandArgs = [...prefix.args, ...args, "--json"];

  return new Promise<AcpCliResult>((resolve, reject) => {
    const child = spawn(prefix.command, commandArgs, {
      env: {
        ...process.env,
        ...(options.testnet === undefined ? {} : { IS_TESTNET: options.testnet ? "true" : "false" }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (code !== 0) {
        reject(new Error(`ACP_CLI_FAILED: exit=${code}; stderr=${stderr.trim()}; stdout=${trimmed}`));
        return;
      }
      if (!trimmed) {
        reject(new Error(`ACP_CLI_EMPTY_RESPONSE: stderr=${stderr.trim()}`));
        return;
      }
      try {
        const json = JSON.parse(trimmed);
        if (json && typeof json === "object" && "error" in json) {
          reject(new Error(`ACP_CLI_ERROR_RESPONSE: ${JSON.stringify(json)}`));
          return;
        }
        resolve({ stdout, stderr, json });
      } catch (error) {
        reject(new Error(`ACP_CLI_INVALID_JSON: ${error instanceof Error ? error.message : String(error)}; stdout=${trimmed}`));
      }
    });
  });
}

export async function fetchAcpJobHistory(input: {
  jobId: string;
  chainId: number;
  testnet?: boolean;
}): Promise<unknown> {
  return (await runAcpJson([
    "job",
    "history",
    "--job-id",
    input.jobId,
    "--chain-id",
    String(input.chainId),
  ], { testnet: input.testnet })).json;
}
