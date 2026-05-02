import type { AgentProfile, DemoState, MongoDocEvent, MongoWrite, TimelineEvent } from "./types";
import { createAgentProfiles, DEFAULT_SOURCES, TASK_PROMPT } from "./demo-data";
import { fetchSources, sourceDocument } from "./live-sources";
import { scoreAgents } from "./scoring";

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string, state: DemoState, suffix = state.step): string {
  return `${state.runId}-${prefix}-${suffix}`;
}

function pushMongoEvent(state: DemoState, collection: string, operation: MongoDocEvent["operation"], document: Record<string, unknown>) {
  state.mongoDocs = [
    {
      id: id(`mongo-${collection}-${operation}`, state, state.mongoDocs.length + state.step + 1),
      collection,
      operation,
      document,
      createdAt: now()
    },
    ...state.mongoDocs
  ].slice(0, 18);
}

function timeline(state: DemoState, layer: TimelineEvent["layer"], label: string, detail: string, writes: MongoWrite[] = []) {
  const event: TimelineEvent = {
    id: id(`timeline-${layer}`, state, state.timeline.length + state.step + 1),
    layer,
    label,
    detail,
    createdAt: now()
  };
  state.timeline = [event, ...state.timeline].slice(0, 24);
  writes.push({
    collection: "audit",
    operation: "insertOne",
    document: {
      _id: event.id,
      task_id: state.taskId,
      event_type: "timeline",
      layer,
      label,
      detail,
      created_at: event.createdAt
    }
  });
  pushMongoEvent(state, "audit", "insertOne", { layer, label, detail });
}

export function createInitialState(): DemoState {
  const createdAt = now();
  const runId = `run-${Date.now()}`;
  return {
    runId,
    taskId: `${runId}-task`,
    groupId: `${runId}-group`,
    teamId: "team-manager-room",
    target: process.env.TEAM_MANAGER_TARGET ?? "custom",
    taskType: "general_decision",
    taskPrompt: TASK_PROMPT,
    status: "idle",
    step: 0,
    createdAt,
    updatedAt: createdAt,
    budget: {
      total: 50_000,
      consumed: 0,
      warnedAt70: false,
      summarizedAt90: false,
      summaryTokensSaved: 0,
      summaryReplacementTokens: 0,
      actionAt100: "abort"
    },
    candidates: createAgentProfiles(),
    selectedAgents: [],
    blackboard: [],
    memoryCards: [],
    subscriptions: [],
    audit: [],
    checkpoints: [],
    timeline: [
      {
        id: `${runId}-timeline-ready`,
        label: "Ready",
        detail: "MongoDB is the control plane for profiles, tasks, groups, blackboard, memory, performance, sources, and audit.",
        layer: "L1",
        createdAt
      }
    ],
    voiceEvents: [],
    mongoDocs: [],
    sources: DEFAULT_SOURCES.map((source) => ({ ...source, status: "pending" })),
    mongo: {
      mode: "unknown",
      dbName: process.env.TEAM_MANAGER_DB ?? process.env.BOARDROOM_DB ?? "team_manager"
    }
  };
}

export async function ingestLiveSources(state: DemoState): Promise<{ state: DemoState; writes: MongoWrite[] }> {
  const working = structuredClone(state) as DemoState;
  const writes: MongoWrite[] = [];
  const fetched = await fetchSources(working.sources, working.taskPrompt);
  working.sources = fetched;
  working.updatedAt = now();

  if (fetched.length > 0) {
    writes.push({
      collection: "source_documents",
      operation: "insertMany",
      documents: fetched.map((item) => sourceDocument(item, working.runId, working.taskId))
    });
  }

  for (const item of fetched) {
    pushMongoEvent(working, "source_documents", "insertOne", {
      source_id: item.id,
      status: item.status,
      content_length: item.contentLength,
      evidence_labels: item.evidence.map((evidence) => evidence.label),
      text_hash: item.textHash
    });
  }

  const fetchedCount = fetched.filter((item) => item.status === "fetched").length;
  const evidenceCount = fetched.reduce((sum, item) => sum + item.evidence.length, 0);
  timeline(
    working,
    "L3",
    "Source ingestion",
    `Fetched ${fetchedCount}/${fetched.length} registered source pages and extracted ${evidenceCount} evidence snippets into source_documents.`,
    writes
  );

  return { state: working, writes };
}

export function spawnTeamRoom(state: DemoState): { state: DemoState; writes: MongoWrite[] } {
  const working = structuredClone(state) as DemoState;
  const writes: MongoWrite[] = [];
  if (working.governancePlan?.status === "approved") {
    working.budget.total = working.governancePlan.totalTokenBudget;
    working.budget.actionAt100 = working.governancePlan.budgetPolicy.hardStopAction;
  }

  const ranked = scoreAgents(working.taskPrompt, working.taskType, working.candidates);
  const selectedIds = new Set(ranked.slice(0, 5).map((agent) => agent.agentId));

  working.candidates = ranked.map((agent) => ({
    ...agent,
    selected: selectedIds.has(agent.agentId),
    status: selectedIds.has(agent.agentId) ? "selected" : "candidate",
    currentStep: selectedIds.has(agent.agentId) ? "Dispatched by capability formula" : "Not selected"
  }));
  working.selectedAgents = working.candidates.filter((agent) => agent.selected);
  working.status = "dispatched";
  working.updatedAt = now();

  writes.push({
    collection: "agent_profiles",
    operation: "insertMany",
    documents: working.candidates.map((agent: AgentProfile) => ({
      _id: agent.agentId,
      agent_id: agent.agentId,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      skills: agent.skills,
      capabilities: agent.capabilities,
      description_embedding: agent.descriptionEmbedding,
      proven_skills: agent.provenSkills,
      avg_duration_ms: agent.avgDurationMs,
      token_efficiency: agent.tokenEfficiency,
      last_performed_at: new Date(agent.lastPerformedAt),
      score: agent.score,
      selected: agent.selected,
      created_at: new Date()
    }))
  });
  pushMongoEvent(working, "agent_profiles", "insertMany", {
    count: working.candidates.length,
    selected_agents: working.selectedAgents.map((agent) => agent.name)
  });

  writes.push({
    collection: "tasks",
    operation: "insertOne",
    document: {
      _id: working.taskId,
      task_type: working.taskType,
      prompt: working.taskPrompt,
      status: working.status,
      token_budget: working.budget.total,
      tokens_consumed: working.budget.consumed,
      governance_plan_id: working.governancePlan?.id,
      agent_token_budgets: Object.fromEntries((working.governancePlan?.agents ?? []).map((agent) => [agent.agentId, agent.tokenBudget])),
      group_id: working.groupId,
      agents_assigned: working.selectedAgents.map((agent) => agent.agentId),
      checkpoint: null,
      created_at: new Date(working.createdAt),
      updated_at: new Date(working.updatedAt)
    }
  });
  writes.push({
    collection: "groups",
    operation: "insertOne",
    document: {
      _id: working.groupId,
      team_id: working.teamId,
      total_token_budget: working.budget.total,
      tokens_consumed: working.budget.consumed,
      governance_plan_id: working.governancePlan?.id,
      manager_reserve: working.governancePlan?.budgetPolicy.managerReserve,
      summarizer_reserve: working.governancePlan?.budgetPolicy.summarizerReserve,
      members: working.selectedAgents.map((agent) => agent.agentId),
      created_at: new Date()
    }
  });
  pushMongoEvent(working, "tasks", "insertOne", {
    task_id: working.taskId,
    token_budget: working.budget.total,
    agents_assigned: working.selectedAgents.map((agent) => agent.name)
  });

  timeline(
    working,
    "L1",
    "Capability dispatch",
    `Ranked ${working.candidates.length} agent profiles and selected ${working.selectedAgents.length} specialists using capability, history, latency, and token-efficiency scores.`,
    writes
  );

  return { state: working, writes };
}
