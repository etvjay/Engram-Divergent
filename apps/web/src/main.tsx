import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type DemoResult = {
  evidenceBoundary: Record<string, string>;
  runA: { executionId: string; route: string[]; outcome: string };
  memory: { id: string; summary: string; sourceExecutionId: string };
  runB: {
    executionId: string;
    retrievalId: string;
    route: string[];
    counterfactualRoute: string[];
    memoryRefs: string[];
    outcome: string;
  };
  changedBehavior: boolean;
};

type Screen = "execute" | "trace" | "memory" | "compare";

const API_BASE = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_BASE_URL ?? "";

const screens: Array<{ id: Screen; label: string; eyebrow: string }> = [
  { id: "execute", label: "Execute", eyebrow: "01" },
  { id: "trace", label: "Live Trace", eyebrow: "02" },
  { id: "memory", label: "Memory Explorer", eyebrow: "03" },
  { id: "compare", label: "Compare Runs", eyebrow: "04" },
];

function routeText(route?: string[]) {
  return route?.join(" → ") ?? "—";
}

function StatusPill({ value }: { value: string }) {
  return <span className={`pill pill-${value.toLowerCase()}`}>{value}</span>;
}

function App() {
  const [screen, setScreen] = useState<Screen>("execute");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcp, setMcp] = useState<{ configured: boolean; connected: boolean; readTools?: string[] } | null>(null);

  const causalChain = useMemo(() => result ? [
    { title: "Prior execution", value: result.runA.executionId.slice(0, 8), detail: `${routeText(result.runA.route)} · ${result.runA.outcome}` },
    { title: "Operational memory", value: result.memory.id.slice(0, 8), detail: result.memory.summary },
    { title: "Retrieved", value: result.runB.retrievalId.slice(0, 8), detail: "Hybrid structured + vector retrieval" },
    { title: "Decision changed", value: routeText(result.runB.route), detail: `Counterfactual: ${routeText(result.runB.counterfactualRoute)}` },
    { title: "Observed outcome", value: result.runB.outcome, detail: "Second simulated execution" },
  ] : [], [result]);

  async function runDemo() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/v1/demo/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Demo failed");
      setResult(payload);
      setScreen("trace");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo failed");
    } finally {
      setRunning(false);
    }
  }

  async function checkMcp() {
    try {
      const response = await fetch(`${API_BASE}/v1/mcp/status`);
      setMcp(await response.json());
    } catch {
      setMcp({ configured: false, connected: false });
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">ENGRAM</div>
          <div className="brand-sub">Execution Memory</div>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={checkMcp}>Check MCP</button>
          <div className={`signal ${mcp?.connected ? "live" : ""}`} />
          <span className="mono small">{mcp ? (mcp.connected ? "MCP CONNECTED" : mcp.configured ? "MCP UNAVAILABLE" : "MCP NOT CONFIGURED") : "EVIDENCE MODE"}</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Durable operational memory for autonomous agents</p>
          <h1>Memory for what agents have done, not just what they know.</h1>
          <p className="lede">Engram turns executions into inspectable experience. A prior failure is persisted, recalled under comparable context, and cited when a later decision changes.</p>
        </div>
        <div className="invariant-card">
          <span className="label">Canonical invariant</span>
          <strong>Execution → Memory → Recall → Different Decision</strong>
          <p>Every arrow must remain reconstructable.</p>
        </div>
      </section>

      <nav className="screen-nav">
        {screens.map((item) => (
          <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)}>
            <span>{item.eyebrow}</span>{item.label}
          </button>
        ))}
      </nav>

      <section className="workspace">
        {screen === "execute" && (
          <div className="panel execute-grid">
            <div>
              <span className="label">New execution</span>
              <h2>Prove behavioral change.</h2>
              <p className="muted">Run the canonical two-execution experiment. Venue behavior is deterministic and simulated; CockroachDB persistence, retrieval, and provenance are the real system under test.</p>
              <div className="field"><span>Intent</span><strong>Acquire target asset using the lowest-risk route</strong></div>
              <div className="field"><span>Context</span><strong>Thin liquidity · Risk tolerance LOW</strong></div>
              <div className="field"><span>Routes</span><strong>A → B → C / A → B → D</strong></div>
              <button className="primary" disabled={running} onClick={runDemo}>{running ? "Running proof…" : "Run Engram proof"}</button>
              {error && <div className="error">{error}</div>}
            </div>
            <div className="boundary">
              <span className="label">Evidence boundary</span>
              <div><b>External execution</b><StatusPill value="SIMULATED" /></div>
              <div><b>Persistence</b><StatusPill value="REAL" /></div>
              <div><b>Retrieval</b><StatusPill value="REAL" /></div>
              <div><b>Decision trace</b><StatusPill value="REAL" /></div>
            </div>
          </div>
        )}

        {screen === "trace" && (
          <div className="panel">
            <div className="section-head"><div><span className="label">Causal trace</span><h2>Why did the second decision change?</h2></div>{result?.changedBehavior && <StatusPill value="CHANGED" />}</div>
            {!result ? <Empty run={runDemo} /> : <div className="trace-list">{causalChain.map((node, index) => <div className="trace-node" key={node.title}><div className="trace-index">{String(index + 1).padStart(2, "0")}</div><div><span>{node.title}</span><strong>{node.value}</strong><p>{node.detail}</p></div></div>)}</div>}
          </div>
        )}

        {screen === "memory" && (
          <div className="panel">
            <div className="section-head"><div><span className="label">Operational memory</span><h2>Inspect the experience, not a summary blob.</h2></div></div>
            {!result ? <Empty run={runDemo} /> : <div className="memory-card"><div className="memory-id mono">MEMORY / {result.memory.id}</div><h3>Comparable Venue C liquidity failures should alter route selection.</h3><p>{result.memory.summary}</p><div className="memory-meta"><div><span>Source execution</span><b>{result.memory.sourceExecutionId}</b></div><div><span>Used by execution</span><b>{result.runB.executionId}</b></div><div><span>Influence</span><b>CHANGED_ACTION</b></div><div><span>Memory reference</span><b>{result.runB.memoryRefs[0]}</b></div></div></div>}
          </div>
        )}

        {screen === "compare" && (
          <div className="panel">
            <div className="section-head"><div><span className="label">Control vs treatment</span><h2>The entire submission in one comparison.</h2></div></div>
            {!result ? <Empty run={runDemo} /> : <div className="compare-grid">
              <article><span className="label">Without prior memory</span><h3>{routeText(result.runA.route)}</h3><StatusPill value={result.runA.outcome} /><p>No relevant execution memory was available. Baseline policy selected Venue C.</p></article>
              <div className="memory-bridge"><span>MEMORY</span><strong>{result.memory.id.slice(0, 8)}</strong><i>influenced →</i></div>
              <article><span className="label">With recalled memory</span><h3>{routeText(result.runB.route)}</h3><StatusPill value={result.runB.outcome} /><p>Engram recalled the compensated failure and replaced the counterfactual Route C with Route D.</p></article>
            </div>}
          </div>
        )}
      </section>

      <footer><span>ENGRAM / BUILD 0.1</span><span>EXTERNAL WORKLOAD: SIMULATED</span><span>MEMORY CAUSALITY: INSPECTABLE</span></footer>
    </main>
  );
}

function Empty({ run }: { run: () => void }) {
  return <div className="empty"><p>No execution evidence exists in this session yet.</p><button className="primary" onClick={run}>Run canonical proof</button></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
