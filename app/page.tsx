"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileSearch,
  Gauge,
  GitBranch,
  Mic2,
  OctagonX,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SquareActivity,
  Terminal,
  Users
} from "lucide-react";
import type { AgentProfile, DemoState, MongoDocEvent } from "@/lib/types";

const scoreTerms = [
  { label: "prompt", weight: "0.25" },
  { label: "history", weight: "0.35" },
  { label: "recency", weight: "0.10" },
  { label: "time", weight: "0.15" },
  { label: "token", weight: "0.15" }
];

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status}`}>{status.replace("_", " ")}</span>;
}

function LayerBadge({ layer }: { layer: string }) {
  return <span className={`layer-badge layer-${layer.toLowerCase()}`}>{layer}</span>;
}

function ControlButton({
  icon,
  label,
  onClick,
  disabled,
  variant = "default"
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger" | "primary";
}) {
  return (
    <button className={`control-button ${variant}`} onClick={onClick} disabled={disabled} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MongoDoc({ event }: { event: MongoDocEvent }) {
  const document = useMemo(() => JSON.stringify(event.document, null, 2), [event.document]);
  return (
    <article className="mongo-row">
      <header>
        <span>{event.collection}</span>
        <code>{event.operation}</code>
      </header>
      <pre>{document}</pre>
    </article>
  );
}

function AgentRow({ agent }: { agent: AgentProfile }) {
  const score = agent.score;
  return (
    <tr className={agent.selected ? "selected-agent-row" : undefined}>
      <td>
        <div className="agent-name">
          <span>{agent.name}</span>
          {agent.selected ? <CheckCircle2 size={14} /> : null}
        </div>
        <small>{agent.role}</small>
      </td>
      <td>{score?.rank ?? "-"}</td>
      <td>{score ? score.matchScore.toFixed(3) : "-"}</td>
      <td>{score ? pct(score.promptRelevance) : "-"}</td>
      <td>{score ? pct(score.historicalSuccess) : "-"}</td>
      <td>{score ? pct(score.timeEfficiency) : "-"}</td>
      <td>{score ? pct(score.tokenEfficiency) : "-"}</td>
      <td>
        <StatusPill status={agent.status} />
      </td>
    </tr>
  );
}

function BudgetMeter({ state }: { state: DemoState }) {
  const percent = Math.min(100, Math.round((state.budget.consumed / state.budget.total) * 100));
  const threshold = percent >= 90 ? "critical" : percent >= 70 ? "warning" : "normal";
  return (
    <section className="panel budget-panel">
      <div className="panel-title">
        <Gauge size={18} />
        <span>Group Token Budget</span>
      </div>
      <div className="budget-topline">
        <strong>{percent}%</strong>
        <span>
          {formatTokens(state.budget.consumed)} / {formatTokens(state.budget.total)}
        </span>
      </div>
      <div className="budget-track" aria-label="Token budget">
        <div className={`budget-fill ${threshold}`} style={{ width: `${percent}%` }} />
        <span className="threshold threshold-70" />
        <span className="threshold threshold-90" />
      </div>
      <div className="threshold-labels">
        <span>70% warning</span>
        <span>90% summarizer</span>
        <span>100% {state.budget.actionAt100}</span>
      </div>
      <div className="budget-events">
        <div className={state.budget.warnedAt70 ? "budget-event active" : "budget-event"}>
          <AlertTriangle size={15} />
          <span>Context warning</span>
        </div>
        <div className={state.budget.summarizedAt90 ? "budget-event active" : "budget-event"}>
          <Sparkles size={15} />
          <span>
            {state.budget.summarizedAt90
              ? `${formatTokens(state.budget.summaryTokensSaved)} -> ${formatTokens(state.budget.summaryReplacementTokens)}`
              : "Summarizer armed"}
          </span>
        </div>
      </div>
    </section>
  );
}

export default function Page() {
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false);
  const spoken = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const response = await fetch("/api/demo/state", { cache: "no-store" });
    setState(await response.json());
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 2500);
    return () => window.clearInterval(interval);
  }, [load]);

  const post = useCallback(async (path: string) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      setState(await response.json());
    } finally {
      setBusy(false);
    }
  }, []);

  const runReplay = useCallback(async () => {
    setBusy(true);
    try {
      for (const path of [
        "/api/demo/spawn",
        "/api/demo/tick",
        "/api/demo/tick",
        "/api/demo/tick",
        "/api/demo/tick",
        "/api/demo/tick",
        "/api/demo/tick",
        "/api/demo/tick"
      ]) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" }
        });
        setState(await response.json());
        await new Promise((resolve) => window.setTimeout(resolve, 850));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    for (const event of state.voiceEvents) {
      if (spoken.current.has(event.id)) {
        continue;
      }
      spoken.current.add(event.id);

      fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: event.text })
      })
        .then(async (response) => {
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("audio/mpeg")) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            await audio.play();
            URL.revokeObjectURL(url);
            return;
          }

          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(event.text));
          }
        })
        .catch(() => undefined);
    }
  }, [state]);

  if (!state) {
    return (
      <main className="loading-screen">
        <SquareActivity size={28} />
        <span>Loading BoardRoom</span>
      </main>
    );
  }

  const percent = Math.round((state.budget.consumed / state.budget.total) * 100);
  const selectedNames = state.selectedAgents.filter((agent) => agent.agentId !== "agent-summarizer").map((agent) => agent.name);
  const lastCheckpoint = state.checkpoints[0];
  const selectedSpecialists = state.selectedAgents.filter((agent) => agent.agentId !== "agent-summarizer");
  const fetchedSources = state.sources.filter((source) => source.status === "fetched").length;
  const evidenceCount = state.sources.reduce((sum, source) => sum + (source.evidence?.length ?? 0), 0);
  const currentFinding = state.blackboard[0];
  const topCandidates = state.candidates.filter((agent) => agent.selected).slice(0, 5);
  const workflowSteps = [
    {
      label: "Intake",
      detail: "Analytics vendor review opened",
      done: true
    },
    {
      label: "Capability Dispatch",
      detail: "MongoDB ranks the specialist pool",
      done: state.selectedAgents.length > 0
    },
    {
      label: "Live Evidence",
      detail: "Public vendor pages fetched into Atlas",
      done: fetchedSources > 0
    },
    {
      label: "Collaborative Review",
      detail: "Agents publish and subscribe through the blackboard",
      done: state.blackboard.length >= 3
    },
    {
      label: "Budget Governance",
      detail: "70% warning and 90% summarizer cascade",
      done: state.budget.warnedAt70 || state.budget.summarizedAt90
    },
    {
      label: "Recovery",
      detail: "Kill and resume ContractRedFlags from checkpoint",
      done: state.status === "resumed" || state.status === "complete"
    },
    {
      label: "Decision",
      detail: "Every claim links back to evidence",
      done: state.status === "complete"
    }
  ];
  const activeStep = Math.max(0, workflowSteps.findIndex((step) => !step.done));
  const activeWorkflow = workflowSteps[activeStep] ?? workflowSteps[workflowSteps.length - 1];

  return (
    <main className="workflow-shell">
      <header className="workflow-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">B</div>
          <div>
            <h1>BoardRoom</h1>
            <p>Governed multi-agent vendor diligence on MongoDB Atlas.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={state.mongo.mode === "atlas" ? "mongo-mode atlas" : "mongo-mode replay"}>
            <Database size={15} />
            {state.mongo.mode === "atlas" ? `Atlas · ${state.mongo.dbName}` : "Replay mode"}
          </span>
          <StatusPill status={state.status} />
        </div>
      </header>

      <section className="case-hero">
        <div className="case-copy">
          <span>Vendor Diligence Case</span>
          <h2>{state.vendor} analytics review</h2>
          <p>{state.taskPrompt}</p>
        </div>
        <div className="command-buttons">
          <ControlButton icon={<Users size={16} />} label="Spawn" onClick={() => post("/api/demo/spawn")} disabled={busy || state.status !== "idle"} variant="primary" />
          <ControlButton icon={<Play size={16} />} label="Advance" onClick={() => post("/api/demo/tick")} disabled={busy} />
          <ControlButton icon={<OctagonX size={16} />} label="Kill" onClick={() => post("/api/demo/kill")} disabled={busy} variant="danger" />
          <ControlButton icon={<RefreshCcw size={16} />} label="Restart" onClick={() => post("/api/demo/restart")} disabled={busy} />
          <ControlButton icon={<Activity size={16} />} label="Run Demo" onClick={runReplay} disabled={busy} />
          <ControlButton icon={<RotateCcw size={16} />} label="Reset" onClick={() => post("/api/demo/reset")} disabled={busy} />
        </div>
      </section>

      <section className="workflow-layout">
        <aside className="workflow-rail">
          <div className="rail-title">
            <Terminal size={18} />
            <span>Workflow</span>
          </div>
          <div className="step-list">
            {workflowSteps.map((step, index) => (
              <article className={step.done ? "workflow-step done" : index === activeStep ? "workflow-step active" : "workflow-step"} key={step.label}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="theme-stack">
            <article>
              <span>Prolonged Coordination</span>
              <strong>Checkpointed steps survive restart.</strong>
            </article>
            <article>
              <span>Multi-Agent Collaboration</span>
              <strong>Specialists coordinate through a shared blackboard.</strong>
            </article>
            <article>
              <span>Adaptive Retrieval</span>
              <strong>Live sources and memory use vector filters.</strong>
            </article>
          </div>
        </aside>

        <section className="review-workspace">
          <section className="stage-panel">
            <div>
              <span>Current Stage</span>
              <h2>{state.status === "complete" ? "Decision ready" : activeWorkflow.label}</h2>
              <p>
                {state.status === "idle"
                  ? "Start by spawning the diligence board. BoardRoom will rank the specialist pool, fetch live evidence, and write the case state to Atlas."
                  : currentFinding?.content ?? activeWorkflow.detail}
              </p>
            </div>
            <div className="stage-metrics">
              <article>
                <span>Agents</span>
                <strong>{selectedSpecialists.length}/5</strong>
              </article>
              <article>
                <span>Evidence</span>
                <strong>{evidenceCount}</strong>
              </article>
              <article>
                <span>Budget</span>
                <strong>{percent}%</strong>
              </article>
            </div>
          </section>

          <section className="specialist-strip">
            {selectedSpecialists.length > 0 ? (
              selectedSpecialists.map((agent) => (
                <article className={`specialist-card ${agent.status}`} key={agent.agentId}>
                  <header>
                    <strong>{agent.name}</strong>
                    <StatusPill status={agent.status} />
                  </header>
                  <p>{agent.currentStep}</p>
                </article>
              ))
            ) : (
              <div className="empty-panel">The specialist board appears here after capability dispatch.</div>
            )}
          </section>

          <section className="evidence-grid">
            <div className="workflow-panel">
              <div className="panel-title split">
                <span>
                  <FileSearch size={18} />
                  Live Evidence
                </span>
                <small>{fetchedSources}/3 fetched</small>
              </div>
              <div className="source-list">
                {state.sources.map((source) => (
                  <article className={`source-card ${source.status ?? "pending"}`} key={source.id}>
                    <header>
                      <strong>{source.title}</strong>
                      <code>{source.status ?? "pending"}</code>
                    </header>
                    <p>{source.evidence?.[0]?.snippet ?? source.note}</p>
                    <footer>
                      <span>{source.contentLength ? `${source.contentLength.toLocaleString()} chars` : "not fetched yet"}</span>
                      <span>{source.evidence?.length ?? 0} snippets</span>
                    </footer>
                  </article>
                ))}
              </div>
            </div>

            <div className="workflow-panel">
              <div className="panel-title split">
                <span>
                  <BrainCircuit size={18} />
                  Blackboard
                </span>
                <small>{state.blackboard.length} findings</small>
              </div>
              <div className="blackboard-feed clean-feed">
                {state.blackboard.map((entry) => (
                  <article className={`blackboard-entry ${entry.entryType}`} key={entry.id}>
                    <header>
                      <span>{entry.agentName}</span>
                      <div>
                        <code>{entry.entryType}</code>
                        <code>{entry.visibility}</code>
                      </div>
                    </header>
                    <p>{entry.content}</p>
                    <footer>
                      <span>reuse {entry.reuseCount}</span>
                      <span>{entry.sourceIds.join(", ") || "team summary"}</span>
                    </footer>
                  </article>
                ))}
                {state.blackboard.length === 0 ? <div className="empty-panel">Findings appear after the first workflow advance.</div> : null}
              </div>
            </div>
          </section>

          <section className="decision-workflow-panel">
            <div className="decision-block">
              <span>Recommendation</span>
              <strong>{state.finalDecision?.verdict ?? "Pending"}</strong>
              <p>{state.finalDecision?.rationale ?? "The decision is emitted after live evidence, blackboard subscriptions, budget cascade, and checkpoint resume complete."}</p>
            </div>
            <div className="checkpoint-compact">
              <span>Latest checkpoint</span>
              <strong>{lastCheckpoint?.agentName ?? "None yet"}</strong>
              <p>{lastCheckpoint?.partialOutput ?? "Agent checkpoints will appear here as MongoDB performance records."}</p>
            </div>
          </section>
        </section>

        <aside className="audit-rail">
          <BudgetMeter state={state} />
          <section className="workflow-panel">
            <div className="panel-title split">
              <span>
                <Database size={18} />
                Atlas Writes
              </span>
              <small>{state.mongo.mode === "atlas" ? "live sandbox" : "fallback"}</small>
            </div>
            <div className="mongo-feed compact-feed">
              {state.mongoDocs.slice(0, 8).map((event) => (
                <MongoDoc event={event} key={event.id} />
              ))}
              {state.mongoDocs.length === 0 ? <div className="empty-panel">MongoDB writes appear here.</div> : null}
            </div>
          </section>

          <section className="workflow-panel">
            <div className="panel-title">
              <GitBranch size={18} />
              <span>Audit Trail</span>
            </div>
            <div className="audit-list compact-feed">
              {state.audit.slice(0, 5).map((event) => (
                <article key={event.id}>
                  <strong>{event.agentName}</strong>
                  <p>{event.claim}</p>
                  <footer>
                    <span>{Math.round(event.confidence * 100)}% confidence</span>
                    <span>{event.sourceIds.join(" -> ")}</span>
                  </footer>
                </article>
              ))}
              {state.audit.length === 0 ? <div className="empty-panel">Claims link back to evidence as the review runs.</div> : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
