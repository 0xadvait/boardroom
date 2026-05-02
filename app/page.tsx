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

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <img src="https://posthog.com/favicon.ico" alt="" />
          </div>
          <div>
            <h1>BoardRoom</h1>
            <p>Five agents. One budget. One blackboard. Kill any of them live and watch them resume.</p>
          </div>
        </div>
        <div className="run-meta">
          <span className={state.mongo.mode === "atlas" ? "mongo-mode atlas" : "mongo-mode replay"}>
            <Database size={15} />
            {state.mongo.mode === "atlas" ? `Atlas · ${state.mongo.dbName}` : "Replay mode"}
          </span>
          <StatusPill status={state.status} />
        </div>
      </header>

      <section className="command-strip">
        <div className="task-brief">
          <span>Vendor evaluation</span>
          <strong>{state.vendor}</strong>
          <p>{state.taskPrompt}</p>
        </div>
        <div className="command-buttons">
          <ControlButton
            icon={<Users size={16} />}
            label="Spawn"
            onClick={() => post("/api/demo/spawn")}
            disabled={busy || state.status !== "idle"}
            variant="primary"
          />
          <ControlButton icon={<Play size={16} />} label="Advance" onClick={() => post("/api/demo/tick")} disabled={busy} />
          <ControlButton icon={<OctagonX size={16} />} label="Kill" onClick={() => post("/api/demo/kill")} disabled={busy} variant="danger" />
          <ControlButton icon={<RefreshCcw size={16} />} label="Restart" onClick={() => post("/api/demo/restart")} disabled={busy} />
          <ControlButton icon={<Activity size={16} />} label="60s Run" onClick={runReplay} disabled={busy} />
          <ControlButton icon={<RotateCcw size={16} />} label="Reset" onClick={() => post("/api/demo/reset")} disabled={busy} />
        </div>
      </section>

      <section className="kpi-grid">
        <div className="kpi">
          <ShieldCheck size={19} />
          <div>
            <span>Selected agents</span>
            <strong>{selectedNames.length || 0}/5</strong>
          </div>
        </div>
        <div className="kpi">
          <BrainCircuit size={19} />
          <div>
            <span>Blackboard entries</span>
            <strong>{state.blackboard.length}</strong>
          </div>
        </div>
        <div className="kpi">
          <GitBranch size={19} />
          <div>
            <span>Checkpoints</span>
            <strong>{state.checkpoints.length}</strong>
          </div>
        </div>
        <div className="kpi">
          <Mic2 size={19} />
          <div>
            <span>Voice events</span>
            <strong>{state.voiceEvents.length}</strong>
          </div>
        </div>
      </section>

      <section className="main-grid">
        <div className="left-stack">
          <section className="panel dispatch-panel">
            <div className="panel-title split">
              <span>
                <FileSearch size={18} />
                Capability Dispatch
              </span>
              <div className="formula">
                {scoreTerms.map((term) => (
                  <code key={term.label}>
                    {term.weight}·{term.label}
                  </code>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Rank</th>
                    <th>Score</th>
                    <th>Prompt</th>
                    <th>History</th>
                    <th>Time</th>
                    <th>Token</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.candidates.map((agent) => (
                    <AgentRow agent={agent} key={agent.agentId} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel agents-panel">
            <div className="panel-title">
              <Users size={18} />
              <span>Live Agents</span>
            </div>
            <div className="agent-grid">
              {state.selectedAgents.map((agent) => (
                <article className={`agent-tile ${agent.status}`} key={agent.agentId}>
                  <header>
                    <strong>{agent.name}</strong>
                    <StatusPill status={agent.status} />
                  </header>
                  <p>{agent.currentStep}</p>
                  <div className="mini-meter">
                    <span style={{ width: `${Math.min(100, (agent.tokensUsed / 9000) * 100)}%` }} />
                  </div>
                </article>
              ))}
              {state.selectedAgents.length === 0 ? (
                <div className="empty-panel">Click Spawn to select the five specialists from the 12-agent registry.</div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="center-stack">
          <BudgetMeter state={state} />

          <section className="panel blackboard-panel">
            <div className="panel-title split">
              <span>
                <BrainCircuit size={18} />
                Shared Blackboard
              </span>
              <small>change streams + vector subscription</small>
            </div>
            <div className="blackboard-feed">
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
                    <span>{entry.sourceIds.length ? entry.sourceIds.join(", ") : "generated summary"}</span>
                  </footer>
                </article>
              ))}
              {state.blackboard.length === 0 ? <div className="empty-panel">Blackboard is waiting for agent findings.</div> : null}
            </div>
          </section>

          <section className="panel subscriptions-panel">
            <div className="panel-title">
              <Activity size={18} />
              <span>Auto-Subscriptions</span>
            </div>
            <div className="subscription-list">
              {state.subscriptions.map((subscription) => (
                <article key={subscription.id}>
                  <strong>{subscription.toAgentName}</strong>
                  <p>{subscription.reason}</p>
                  <span>vector score {subscription.vectorScore.toFixed(3)}</span>
                </article>
              ))}
              {state.subscriptions.length === 0 ? <div className="empty-panel">No subscriptions yet.</div> : null}
            </div>
          </section>
        </div>

        <div className="right-stack">
          <section className="panel mongo-panel">
            <div className="panel-title split">
              <span>
                <Database size={18} />
                MongoDB Writes
              </span>
              <small>{state.mongo.mode === "atlas" ? "live sandbox" : "fallback replay"}</small>
            </div>
            <div className="mongo-feed">
              {state.mongoDocs.map((event) => (
                <MongoDoc event={event} key={event.id} />
              ))}
              {state.mongoDocs.length === 0 ? <div className="empty-panel">MongoDB writes will materialize here.</div> : null}
            </div>
          </section>

          <section className="panel audit-panel">
            <div className="panel-title">
              <GitBranch size={18} />
              <span>Audit Graph</span>
            </div>
            <div className="audit-list">
              {state.audit.map((event) => (
                <article key={event.id}>
                  <strong>{event.agentName}</strong>
                  <p>{event.claim}</p>
                  <footer>
                    <span>{Math.round(event.confidence * 100)}% confidence</span>
                    <span>{event.sourceIds.join(" -> ")}</span>
                  </footer>
                </article>
              ))}
              {state.audit.length === 0 ? <div className="empty-panel">Claims will link to blackboard entries and sources.</div> : null}
            </div>
          </section>
        </div>
      </section>

      <section className="bottom-grid">
        <section className="panel timeline-panel">
          <div className="panel-title">
            <Terminal size={18} />
            <span>Demo Timeline</span>
          </div>
          <div className="timeline-list">
            {state.timeline.map((event) => (
              <article key={event.id}>
                <LayerBadge layer={event.layer} />
                <div>
                  <header>
                    <strong>{event.label}</strong>
                    <span>{shortTime(event.createdAt)}</span>
                  </header>
                  <p>{event.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel checkpoint-panel">
          <div className="panel-title">
            <RefreshCcw size={18} />
            <span>Checkpoint Resume</span>
          </div>
          {lastCheckpoint ? (
            <div className="checkpoint-body">
              <strong>{lastCheckpoint.agentName}</strong>
              <p>{lastCheckpoint.partialOutput}</p>
              <code>{lastCheckpoint.mongoChangeStreamResumeToken}</code>
              <span>
                step {lastCheckpoint.stepIndex} · {lastCheckpoint.outcome}
              </span>
            </div>
          ) : (
            <div className="empty-panel">No checkpoint yet.</div>
          )}
        </section>

        <section className="panel decision-panel">
          <div className="panel-title">
            <CheckCircle2 size={18} />
            <span>Final Decision</span>
          </div>
          {state.finalDecision ? (
            <div className="decision-body">
              <strong>{state.finalDecision.verdict}</strong>
              <span>confidence {Math.round(state.finalDecision.confidence * 100)}%</span>
              <p>{state.finalDecision.rationale}</p>
            </div>
          ) : (
            <div className="decision-standby">
              <span>{percent}% budget used</span>
              <p>Decision unlocks after resume and final audit write.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
