import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  advanceDemo,
  ingestLiveSources,
  killContractAgent,
  restartContractAgent,
  spawnTeamRoom
} from "../lib/demo-engine";
import { getDemoState, resetDemoState, setDemoState } from "../lib/demo-store";
import { approveGovernancePlan, buildGovernancePlan, governancePlanWrites } from "../lib/governance-plan";
import { applyMongoWrites, closeMongoClient, resetMongoDemo } from "../lib/mongo";
import { fetchVendorSources, sourceDocument } from "../lib/live-sources";
import { cosineSimilarity, pseudoEmbedding } from "../lib/scoring";
import type {
  AuditEvent,
  BlackboardEntry,
  CheckpointRecord,
  DemoState,
  MemoryCard,
  MongoWrite,
  SourceRef,
  Visibility
} from "../lib/types";

function logEvent(event: string, fields: Record<string, unknown> = {}) {
  const rendered = Object.entries(fields)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  console.error(`[team-manager] ${event}${rendered ? ` ${rendered}` : ""}`);
}

function compactState(state: DemoState) {
  return {
    runId: state.runId,
    taskId: state.taskId,
    status: state.status,
    mongo: state.mongo,
    vendor: state.vendor,
    selectedAgents: state.selectedAgents
      .filter((agent) => agent.agentId !== "agent-summarizer")
      .map((agent) => ({
        agentId: agent.agentId,
        name: agent.name,
        status: agent.status,
        score: agent.score,
        currentStep: agent.currentStep
      })),
    sources: state.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      status: source.status,
      contentLength: source.contentLength ?? 0,
      evidenceCount: source.evidence?.length ?? 0
    })),
    budget: state.budget,
    governancePlan: state.governancePlan
      ? {
          id: state.governancePlan.id,
          status: state.governancePlan.status,
          collaborationMode: state.governancePlan.collaborationMode,
          totalTokenBudget: state.governancePlan.totalTokenBudget,
          routingStages: state.governancePlan.routingCascade.map((stage) => stage.stage),
          agents: state.governancePlan.agents.map((agent) => ({
            agentId: agent.agentId,
            name: agent.name,
            priority: agent.priority,
            tokenBudget: agent.tokenBudget,
            model: agent.model.model
          }))
        }
      : null,
    blackboardEntries: state.blackboard.length,
    checkpoints: state.checkpoints.length,
    subscriptions: state.subscriptions.length,
    decision: state.finalDecision
  };
}

function toolJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

async function applyAndStore(state: DemoState, writes: MongoWrite[]) {
  await applyMongoWrites(state, writes);
  setDemoState(state);
  return state;
}

function now(): string {
  return new Date().toISOString();
}

function stableId(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function scopedId(state: DemoState, prefix: string, input = ""): string {
  return `${state.runId}-${prefix}-${stableId(`${Date.now()}-${input}`)}`;
}

function agentName(state: DemoState, agentId: string): string {
  return (
    state.selectedAgents.find((agent) => agent.agentId === agentId)?.name ??
    state.candidates.find((agent) => agent.agentId === agentId)?.name ??
    agentId
  );
}

function sourceRefsFromInput(sources: Array<{ url: string; title?: string; note?: string }>): SourceRef[] {
  return sources.map((source, index) => ({
    id: `src-user-${index + 1}-${stableId(source.url).slice(0, 8)}`,
    title: source.title ?? new URL(source.url).hostname,
    url: source.url,
    note: source.note ?? "User-provided source for this Team Manager run.",
    status: "pending"
  }));
}

async function writeAuditEvent(state: DemoState, event: Record<string, unknown>) {
  await applyAndStore(state, [
    {
      collection: "audit",
      operation: "insertOne",
      document: {
        _id: scopedId(state, "audit-event", JSON.stringify(event)),
        task_id: state.taskId,
        created_at: new Date(),
        ...event
      }
    }
  ]);
}

async function persistTaskState(state: DemoState) {
  await applyAndStore(state, [
    {
      collection: "tasks",
      operation: "updateOne",
      filter: { _id: state.taskId },
      update: {
        $set: {
          status: state.status,
          tokens_consumed: state.budget.consumed,
          token_budget: state.budget.total,
          budget_state: state.budget,
          updated_at: new Date()
        }
      }
    },
    {
      collection: "groups",
      operation: "updateOne",
      filter: { _id: state.groupId },
      update: {
        $set: {
          tokens_consumed: state.budget.consumed,
          updated_at: new Date()
        }
      }
    }
  ]);
}

const server = new McpServer({
  name: "team-manager",
  version: "0.1.0"
});

server.registerTool(
  "team_manager_plan_room",
  {
    title: "Plan Agent Team",
    description:
      "Act as the Team Manager: propose measurement weights, agent roster, model profiles, memory policy, token budgets, and questions for the human before any agents start.",
    inputSchema: {
      request: z
        .string()
        .default("I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way.")
        .describe("The user's high-level work request."),
      vendor: z.string().default("PostHog").describe("Vendor or target entity for the live workload."),
      tokenBudget: z.number().int().positive().default(50_000).describe("Proposed group token budget."),
      reset: z.boolean().default(true).describe("Reset the current room before proposing a new plan.")
    }
  },
  async ({ request, vendor, tokenBudget, reset }) => {
    let state = reset ? resetDemoState() : getDemoState();
    if (reset) {
      await resetMongoDemo(state);
    }

    state.vendor = vendor;
    state.taskPrompt = request;
    state.budget.total = tokenBudget;
    const plan = buildGovernancePlan({
      runId: state.runId,
      request,
      vendor,
      taskType: state.taskType,
      candidates: state.candidates,
      totalTokenBudget: tokenBudget
    });
    state.governancePlan = plan;
    state = await applyAndStore(state, governancePlanWrites(plan));
    logEvent("manager.plan.proposed", {
      planId: plan.id,
      tokenBudget,
      questions: plan.teamManager.questionsForUser,
      agents: plan.agents.map((agent) => ({
        name: agent.name,
        tokenBudget: agent.tokenBudget,
        model: agent.model.model,
        priority: agent.priority
      }))
    });

    return toolJson({
      message: "Team Manager proposed a room plan and is waiting for human approval or edits.",
      requiresUserApproval: true,
      nextTool: "team_manager_approve_plan",
      proposedPlan: plan
    });
  }
);

server.registerTool(
  "team_manager_approve_plan",
  {
    title: "Approve Agent Team Plan",
    description: "Approve or request revisions to the Team Manager plan before starting the governed agent room.",
    inputSchema: {
      approved: z.boolean().default(true).describe("Set false to record that the user requested revisions."),
      userNotes: z.string().optional().describe("Human feedback, constraints, or approval notes."),
      totalTokenBudget: z.number().int().positive().optional().describe("Optional replacement group token budget."),
      agentBudgetOverrides: z.record(z.number().int().positive()).optional().describe("Optional map of agent_id to token cap.")
    }
  },
  async ({ approved, userNotes, totalTokenBudget, agentBudgetOverrides }) => {
    const state = getDemoState();
    if (!state.governancePlan) {
      return toolJson({
        message: "No proposed plan exists yet. Call team_manager_plan_room first.",
        nextTool: "team_manager_plan_room"
      });
    }

    const result = approveGovernancePlan(state.governancePlan, {
      approved,
      userNotes,
      totalTokenBudget,
      agentBudgetOverrides
    });
    state.governancePlan = result.plan;
    state.budget.total = result.plan.totalTokenBudget;
    await applyAndStore(state, result.writes);
    logEvent("manager.plan.decision", {
      planId: result.plan.id,
      status: result.plan.status,
      totalTokenBudget: result.plan.totalTokenBudget,
      userNotes
    });

    return toolJson({
      message: approved
        ? "Team Manager plan approved. Start the room with team_manager_start_room."
        : "Team Manager recorded revision request. Update the plan before starting.",
      nextTool: approved ? "team_manager_start_room" : "team_manager_plan_room",
      plan: result.plan
    });
  }
);

server.registerTool(
  "team_manager_set_sources",
  {
    title: "Set Room Sources",
    description:
      "Register arbitrary source URLs for the current room. These are the sources the host agent wants Team Manager to ingest and govern; no scenario-specific source pack is assumed.",
    inputSchema: {
      sources: z
        .array(
          z.object({
            url: z.string().url(),
            title: z.string().optional(),
            note: z.string().optional()
          })
        )
        .min(1)
        .describe("Public source URLs selected by the host agent or user.")
    }
  },
  async ({ sources }) => {
    const state = getDemoState();
    state.sources = sourceRefsFromInput(sources);
    await writeAuditEvent(state, {
      event_type: "sources_registered",
      source_count: state.sources.length,
      sources: state.sources.map((source) => ({ id: source.id, title: source.title, url: source.url }))
    });
    setDemoState(state);
    logEvent("sources.registered", {
      count: state.sources.length,
      urls: state.sources.map((source) => source.url)
    });

    return toolJson({
      message: "Sources registered. Call team_manager_ingest_sources or team_manager_start_room to fetch and store them.",
      sources: state.sources
    });
  }
);

server.registerTool(
  "team_manager_ingest_sources",
  {
    title: "Ingest Room Sources",
    description:
      "Fetch the current room's source URLs, extract generic evidence snippets from the task query, and store them in MongoDB source_documents.",
    inputSchema: {}
  },
  async () => {
    const state = getDemoState();
    if (state.sources.length === 0) {
      return toolJson({
        message: "No sources are registered. Call team_manager_set_sources first.",
        nextTool: "team_manager_set_sources"
      });
    }

    const fetched = await fetchVendorSources(state.sources, state.taskPrompt);
    state.sources = fetched;
    await applyAndStore(state, [
      {
        collection: "source_documents",
        operation: "insertMany",
        documents: fetched.map((source) => sourceDocument(source, state.runId, state.taskId))
      },
      {
        collection: "audit",
        operation: "insertOne",
        document: {
          _id: scopedId(state, "audit-sources-ingested"),
          task_id: state.taskId,
          event_type: "sources_ingested",
          fetched: fetched.filter((source) => source.status === "fetched").length,
          evidence_count: fetched.reduce((sum, source) => sum + source.evidence.length, 0),
          created_at: new Date()
        }
      }
    ]);
    logEvent("sources.ingested.generic", {
      fetched: fetched.filter((source) => source.status === "fetched").length,
      evidenceSnippets: fetched.reduce((sum, source) => sum + source.evidence.length, 0)
    });

    return toolJson({
      message: "Sources ingested into MongoDB source_documents.",
      sources: state.sources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        status: source.status,
        evidenceCount: source.evidence?.length ?? 0,
        evidence: source.evidence
      }))
    });
  }
);

server.registerTool(
  "team_manager_post_blackboard",
  {
    title: "Post Blackboard Entry",
    description:
      "Append a source-linked finding, decision, request, progress update, or warning to the shared MongoDB blackboard.",
    inputSchema: {
      agentId: z.string().describe("Authoring agent id, for example agent-security."),
      entryType: z.enum(["discovery", "decision", "request", "progress", "warning"]),
      visibility: z.enum(["private", "team", "global"]).default("team"),
      content: z.string().min(1),
      sourceIds: z.array(z.string()).default([]),
      reuseCount: z.number().int().nonnegative().default(1),
      criticRatified: z.boolean().default(false).describe("Promote this entry to team visibility even before 3-agent reuse.")
    }
  },
  async ({ agentId, entryType, visibility, content, sourceIds, reuseCount, criticRatified }) => {
    const state = getDemoState();
    const createdAt = now();
    const promoted = visibility !== "private" || reuseCount >= 3 || criticRatified;
    const effectiveVisibility = visibility === "private" && promoted ? "team" : visibility;
    const entry: BlackboardEntry = {
      id: scopedId(state, "bb", `${agentId}-${content}`),
      taskId: state.taskId,
      entryType,
      visibility: effectiveVisibility,
      agentId,
      agentName: agentName(state, agentId),
      content,
      sourceIds,
      contentEmbedding: pseudoEmbedding(content),
      reactions: [],
      createdAt,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
      promoted,
      reuseCount
    };
    state.blackboard = [entry, ...state.blackboard].slice(0, 50);
    await applyAndStore(state, [
      {
        collection: "blackboard_entries",
        operation: "insertOne",
        document: {
          _id: entry.id,
          task_id: entry.taskId,
          entry_type: entry.entryType,
          visibility: entry.visibility,
          agent_id: entry.agentId,
          agent_name: entry.agentName,
          content: entry.content,
          source_ids: entry.sourceIds,
          content_embedding: entry.contentEmbedding,
          reactions: entry.reactions,
          expires_at: new Date(entry.expiresAt),
          promoted: entry.promoted,
          reuse_count: entry.reuseCount,
          created_at: new Date(entry.createdAt)
        }
      },
      {
        collection: "audit",
        operation: "insertOne",
        document: {
          _id: scopedId(state, "audit-blackboard", entry.id),
          task_id: state.taskId,
          event_type: "blackboard_posted",
          blackboard_entry_id: entry.id,
          agent_id: agentId,
          source_ids: sourceIds,
          created_at: new Date()
        }
      }
    ]);
    logEvent("blackboard.posted", {
      entryId: entry.id,
      agent: entry.agentName,
      entryType,
      visibility: effectiveVisibility,
      promoted,
      sourceIds
    });

    return toolJson({
      message: "Blackboard entry stored.",
      entry
    });
  }
);

server.registerTool(
  "team_manager_query_context",
  {
    title: "Query Shared Context",
    description:
      "Retrieve relevant blackboard entries, scoped memory cards, and source evidence for an agent using visibility filters and local vector similarity.",
    inputSchema: {
      query: z.string().min(1),
      agentId: z.string().optional(),
      teamId: z.string().optional(),
      topK: z.number().int().positive().default(5)
    }
  },
  async ({ query, agentId, teamId, topK }) => {
    const state = getDemoState();
    const vector = pseudoEmbedding(query);
    const currentTeamId = teamId ?? state.teamId;
    const visibleMemory = state.memoryCards.filter((card) => {
      if (card.visibility === "global") return true;
      if (card.visibility === "team") return card.teamId === currentTeamId;
      return Boolean(agentId && card.ownerAgentId === agentId);
    });
    const blackboard = state.blackboard
      .map((entry) => ({ ...entry, score: cosineSimilarity(vector, entry.contentEmbedding) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
    const memory = visibleMemory
      .map((card) => ({ ...card, score: cosineSimilarity(vector, card.embedding) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
    const sourceEvidence = state.sources
      .flatMap((source) =>
        (source.evidence ?? []).map((evidence) => ({
          sourceId: source.id,
          title: source.title,
          url: source.url,
          ...evidence,
          score: cosineSimilarity(vector, pseudoEmbedding(`${evidence.label} ${evidence.snippet}`))
        }))
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    await writeAuditEvent(state, {
      event_type: "context_queried",
      agent_id: agentId,
      team_id: currentTeamId,
      query,
      returned_blackboard: blackboard.length,
      returned_memory: memory.length,
      returned_source_evidence: sourceEvidence.length
    });

    return toolJson({
      query,
      visibility: {
        agentId,
        teamId: currentTeamId
      },
      blackboard,
      memory,
      sourceEvidence
    });
  }
);

server.registerTool(
  "team_manager_write_memory",
  {
    title: "Write Scoped Memory",
    description: "Write private, team, or global memory into MongoDB memory_cards.",
    inputSchema: {
      ownerAgentId: z.string(),
      visibility: z.enum(["private", "team", "global"]).default("private"),
      content: z.string().min(1),
      reuseCount: z.number().int().nonnegative().default(1),
      criticRatified: z.boolean().default(false).describe("Promote this memory to team visibility even before 3-agent reuse."),
      sourceEntryId: z.string().optional()
    }
  },
  async ({ ownerAgentId, visibility, content, reuseCount, criticRatified, sourceEntryId }) => {
    const state = getDemoState();
    const promoted = visibility !== "private" || reuseCount >= 3 || criticRatified;
    const effectiveVisibility = visibility === "private" && promoted ? "team" : visibility;
    const card: MemoryCard = {
      id: scopedId(state, "memory", `${ownerAgentId}-${content}`),
      taskId: state.taskId,
      ownerAgentId,
      teamId: state.teamId,
      visibility: effectiveVisibility,
      content,
      embedding: pseudoEmbedding(content),
      reuseCount,
      promotedAt: promoted ? now() : undefined,
      sourceEntryId
    };
    state.memoryCards = [card, ...state.memoryCards].slice(0, 50);
    await applyAndStore(state, [
      {
        collection: "memory_cards",
        operation: "insertOne",
        document: {
          _id: card.id,
          task_id: card.taskId,
          owner_agent_id: card.ownerAgentId,
          team_id: card.teamId,
          visibility: card.visibility,
          content: card.content,
          embedding: card.embedding,
          reuse_count: card.reuseCount,
          promoted_at: card.promotedAt ? new Date(card.promotedAt) : undefined,
          source_entry_id: card.sourceEntryId,
          created_at: new Date()
        }
      }
    ]);

    return toolJson({
      message: "Memory card stored.",
      card
    });
  }
);

server.registerTool(
  "team_manager_record_checkpoint",
  {
    title: "Record Agent Checkpoint",
    description: "Persist an agent checkpoint to MongoDB agent_performance_records for crash recovery.",
    inputSchema: {
      agentId: z.string(),
      stepIndex: z.number().int().nonnegative(),
      partialOutput: z.string().default(""),
      pendingToolCalls: z.array(z.string()).default([]),
      tokensInput: z.number().int().nonnegative().default(0),
      tokensOutput: z.number().int().nonnegative().default(0),
      outcome: z.enum(["running", "checkpoint", "resumed", "success", "killed"]).default("checkpoint")
    }
  },
  async ({ agentId, stepIndex, partialOutput, pendingToolCalls, tokensInput, tokensOutput, outcome }) => {
    const state = getDemoState();
    const startedAt = now();
    const record: CheckpointRecord = {
      id: scopedId(state, "checkpoint", `${agentId}-${stepIndex}-${partialOutput}`),
      taskId: state.taskId,
      agentId,
      agentName: agentName(state, agentId),
      stepIndex,
      pendingToolCalls,
      partialOutput,
      mongoChangeStreamResumeToken: `resume-token-${state.runId}-${agentId}-${stepIndex}`,
      startedAt,
      tokensInput,
      tokensOutput,
      outcome
    };
    state.checkpoints = [record, ...state.checkpoints].slice(0, 50);
    await applyAndStore(state, [
      {
        collection: "agent_performance_records",
        operation: "insertOne",
        document: {
          _id: record.id,
          task_id: record.taskId,
          agent_id: record.agentId,
          agent_name: record.agentName,
          task_type: state.taskType,
          step_index: record.stepIndex,
          pending_tool_calls: record.pendingToolCalls,
          partial_output: record.partialOutput,
          mongo_change_stream_resume_token: record.mongoChangeStreamResumeToken,
          started_at: new Date(record.startedAt),
          tokens_input: record.tokensInput,
          tokens_output: record.tokensOutput,
          tokens_total: record.tokensInput + record.tokensOutput,
          outcome: record.outcome
        }
      }
    ]);

    return toolJson({
      message: "Checkpoint stored.",
      checkpoint: record
    });
  }
);

server.registerTool(
  "team_manager_update_budget",
  {
    title: "Update Token Budget",
    description: "Update group token usage and return threshold actions for the host agent to enforce.",
    inputSchema: {
      tokensConsumed: z.number().int().nonnegative(),
      tokenBudget: z.number().int().positive().optional()
    }
  },
  async ({ tokensConsumed, tokenBudget }) => {
    const state = getDemoState();
    if (tokenBudget) {
      state.budget.total = tokenBudget;
    }
    state.budget.consumed = Math.min(tokensConsumed, state.budget.total);
    const ratio = state.budget.consumed / state.budget.total;
    const actions: string[] = [];
    if (ratio >= 0.7 && !state.budget.warnedAt70) {
      state.budget.warnedAt70 = true;
      actions.push("inject_budget_warning");
    }
    if (ratio >= 0.9 && !state.budget.summarizedAt90) {
      state.budget.summarizedAt90 = true;
      state.budget.summaryTokensSaved = 0;
      state.budget.summaryReplacementTokens = 0;
      actions.push("spawn_summarizer_or_compact_context");
    }
    if (ratio >= 1) {
      actions.push(state.budget.actionAt100);
    }
    if (actions.length > 0) {
      await writeAuditEvent(state, {
        event_type: "budget_threshold_crossed",
        tokens_consumed: state.budget.consumed,
        token_budget: state.budget.total,
        percent_used: Number((ratio * 100).toFixed(1)),
        actions
      });
    }
    await persistTaskState(state);

    return toolJson({
      message: "Budget updated.",
      budget: state.budget,
      percentUsed: Number((ratio * 100).toFixed(1)),
      actions
    });
  }
);

server.registerTool(
  "team_manager_emit_decision",
  {
    title: "Emit Audited Decision",
    description: "Store the final decision and claim-to-evidence audit trail in MongoDB.",
    inputSchema: {
      verdict: z.string(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
      votes: z.record(z.enum(["buy", "hold", "no_buy"])).default({}),
      claims: z
        .array(
          z.object({
            agentId: z.string(),
            claim: z.string(),
            blackboardEntryId: z.string(),
            sourceIds: z.array(z.string()).default([]),
            confidence: z.number().min(0).max(1).default(0.7)
          })
        )
        .default([])
    }
  },
  async ({ verdict, confidence, rationale, votes, claims }) => {
    const state = getDemoState();
    state.status = "complete";
    state.finalDecision = { verdict, confidence, rationale, votes };
    const createdAt = now();
    const auditEvents: AuditEvent[] = claims.map((claim) => ({
      id: scopedId(state, "audit-claim", `${claim.agentId}-${claim.claim}`),
      taskId: state.taskId,
      claim: claim.claim,
      agentId: claim.agentId,
      agentName: agentName(state, claim.agentId),
      blackboardEntryId: claim.blackboardEntryId,
      sourceIds: claim.sourceIds,
      confidence: claim.confidence,
      createdAt
    }));
    state.audit = [...auditEvents, ...state.audit].slice(0, 100);
    await applyAndStore(state, [
      {
        collection: "tasks",
        operation: "updateOne",
        filter: { _id: state.taskId },
        update: {
          $set: {
            status: state.status,
            final_decision: state.finalDecision,
            updated_at: new Date()
          }
        }
      },
      {
        collection: "audit",
        operation: "insertMany",
        documents: [
          {
            _id: scopedId(state, "audit-decision"),
            task_id: state.taskId,
            event_type: "decision",
            verdict,
            confidence,
            rationale,
            votes,
            created_at: new Date(createdAt)
          },
          ...auditEvents.map((event) => ({
            _id: event.id,
            task_id: event.taskId,
            claim: event.claim,
            agent_id: event.agentId,
            agent_name: event.agentName,
            blackboard_entry_id: event.blackboardEntryId,
            source_ids: event.sourceIds,
            confidence: event.confidence,
            created_at: new Date(event.createdAt)
          }))
        ]
      }
    ]);

    return toolJson({
      message: "Decision and audit trail stored.",
      decision: state.finalDecision,
      audit: auditEvents
    });
  }
);

server.registerTool(
  "team_manager_start_room",
  {
    title: "Start Governed Agent Room",
    description:
      "Start the approved Team Manager room, dispatch the specialist pool, fetch live evidence, and persist room state to MongoDB Atlas.",
    inputSchema: {
      request: z
        .string()
        .default("I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way.")
        .describe("The user's high-level work request."),
      vendor: z.string().default("PostHog").describe("Vendor or target entity for the live workload."),
      tokenBudget: z.number().int().positive().default(50_000).describe("Group token budget for the governed run."),
      reset: z.boolean().default(false).describe("Reset the current room before starting."),
      autoApprovePlan: z.boolean().default(false).describe("For rehearsals only: auto-approve a proposed plan if none exists.")
    }
  },
  async ({ request, vendor, tokenBudget, reset, autoApprovePlan }) => {
    let state = reset ? resetDemoState() : getDemoState();
    if (reset) {
      await resetMongoDemo(state);
    }

    state.vendor = vendor;
    state.taskPrompt = request;
    state.budget.total = tokenBudget;
    if (!state.governancePlan || state.governancePlan.status !== "approved") {
      const plan = buildGovernancePlan({
        runId: state.runId,
        request,
        vendor,
        taskType: state.taskType,
        candidates: state.candidates,
        totalTokenBudget: tokenBudget
      });
      state.governancePlan = plan;
      await applyAndStore(state, governancePlanWrites(plan));

      if (!autoApprovePlan) {
        logEvent("manager.start.blocked_for_approval", {
          planId: plan.id,
          questions: plan.teamManager.questionsForUser
        });
        return toolJson({
          message: "Team Manager will not start agents until the human approves the proposed room plan.",
          requiresUserApproval: true,
          nextTool: "team_manager_approve_plan",
          proposedPlan: plan
        });
      }

      const approval = approveGovernancePlan(plan, {
        approved: true,
        userNotes: "Auto-approved for rehearsal."
      });
      state.governancePlan = approval.plan;
      await applyAndStore(state, approval.writes);
    }

    state.budget.total = state.governancePlan.totalTokenBudget;
    logEvent("room.configure", {
      vendor,
      tokenBudget: state.budget.total,
      governancePlanId: state.governancePlan.id,
      memoryVisibility: state.governancePlan.memoryPolicy.visibility,
      budgetThresholds: ["70% warning", "90% summarizer", "100% abort"]
    });
    logEvent("dispatch.formula", {
      prompt: 0.25,
      history: 0.35,
      recency: 0.1,
      time: 0.15,
      tokenEfficiency: 0.15
    });

    const spawnResult = spawnTeamRoom(state);
    const usesDemoPostHogSources =
      spawnResult.state.sources.some((source) => source.id.startsWith("src-posthog")) &&
      spawnResult.state.taskPrompt.toLowerCase().includes("posthog");
    const hasUserSources = spawnResult.state.sources.some((source) => source.id.startsWith("src-user"));

    if (!usesDemoPostHogSources && !hasUserSources) {
      spawnResult.state.sources = [];
      state = await applyAndStore(spawnResult.state, spawnResult.writes);
      logEvent("room.started.awaiting_sources", {
        taskId: state.taskId,
        reason: "custom task has no user-provided sources"
      });
      return toolJson({
        message:
          "Team Manager started the approved room and dispatched agents, but did not ingest demo sources for this custom task. Call team_manager_set_sources, then team_manager_ingest_sources.",
        nextTools: ["team_manager_set_sources", "team_manager_ingest_sources"],
        state: compactState(state)
      });
    }

    if (hasUserSources) {
      state = await applyAndStore(spawnResult.state, spawnResult.writes);
      logEvent("room.started.ready_for_user_source_ingestion", {
        taskId: state.taskId,
        sources: state.sources.length
      });
      return toolJson({
        message: "Team Manager started the approved room and dispatched agents. Call team_manager_ingest_sources to fetch the registered sources.",
        nextTool: "team_manager_ingest_sources",
        state: compactState(state)
      });
    }

    const ingestResult = await ingestLiveSources(spawnResult.state);
    state = await applyAndStore(ingestResult.state, [...spawnResult.writes, ...ingestResult.writes]);
    logEvent("dispatch.selected", {
      agents: state.selectedAgents
        .filter((agent) => agent.agentId !== "agent-summarizer")
        .map((agent) => ({
          name: agent.name,
          rank: agent.score?.rank,
          score: agent.score?.matchScore,
          tokenEfficiency: agent.score?.tokenEfficiency
        }))
    });
    logEvent("sources.ingested", {
      collection: "source_documents",
      fetched: state.sources.filter((source) => source.status === "fetched").length,
      evidenceSnippets: state.sources.reduce((sum, source) => sum + (source.evidence?.length ?? 0), 0)
    });

    const approvedPlan = state.governancePlan;
    if (!approvedPlan) {
      throw new Error("Approved governance plan missing after start.");
    }

    return toolJson({
      message: "Team Manager started the approved room. Agents dispatched and live evidence fetched.",
      governance: {
        plan: approvedPlan,
        tokenBudget: state.budget.total,
        memoryVisibility: approvedPlan.memoryPolicy.visibility,
        dispatchWeights: approvedPlan.dispatchWeights
      },
      state: compactState(state)
    });
  }
);

server.registerTool(
  "team_manager_advance",
  {
    title: "Advance Governance Step",
    description:
      "Advance the governed workflow by one step: blackboard findings, subscriptions, budget cascade, checkpoint recovery, and final decision.",
    inputSchema: {}
  },
  async () => {
    const current = getDemoState();
    if (current.selectedAgents.length === 0) {
      const spawnResult = spawnTeamRoom(current);
      const ingestResult = await ingestLiveSources(spawnResult.state);
      const state = await applyAndStore(ingestResult.state, [...spawnResult.writes, ...ingestResult.writes]);
      return toolJson({
        message: "Room was empty, so Team Manager started the room instead.",
        state: compactState(state)
      });
    }

    const result = advanceDemo(current);
    const state = await applyAndStore(result.state, result.writes);
    logEvent("room.advance", {
      status: state.status,
      budget: `${state.budget.consumed}/${state.budget.total}`,
      warnedAt70: state.budget.warnedAt70,
      summarizedAt90: state.budget.summarizedAt90,
      blackboardEntries: state.blackboard.length,
      checkpoints: state.checkpoints.length,
      latestAgent: state.checkpoints[0]?.agentName
    });

    return toolJson({
      message: "Advanced one governance step.",
      state: compactState(state),
      latestBlackboardEntry: state.blackboard[0] ?? null,
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "team_manager_kill_agent",
  {
    title: "Kill Contract Agent",
    description: "Simulate killing the ContractRedFlags agent after its latest checkpoint has been persisted.",
    inputSchema: {}
  },
  async () => {
    const result = killContractAgent(getDemoState());
    const state = await applyAndStore(result.state, result.writes);
    logEvent("agent.kill", {
      agent: "ContractRedFlags",
      checkpoint: state.checkpoints[0]?.mongoChangeStreamResumeToken,
      partialOutput: state.checkpoints[0]?.partialOutput
    });
    return toolJson({
      message: "ContractRedFlags killed after checkpoint write.",
      state: compactState(state),
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "team_manager_resume_agent",
  {
    title: "Resume Contract Agent",
    description: "Resume ContractRedFlags from the latest MongoDB checkpoint.",
    inputSchema: {}
  },
  async () => {
    const result = restartContractAgent(getDemoState());
    const state = await applyAndStore(result.state, result.writes);
    logEvent("agent.resume", {
      agent: "ContractRedFlags",
      checkpoint: state.checkpoints[0]?.mongoChangeStreamResumeToken,
      status: state.status
    });
    return toolJson({
      message: "ContractRedFlags resumed from MongoDB checkpoint.",
      state: compactState(state),
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "team_manager_state",
  {
    title: "Read Team Manager State",
    description: "Read the current governed room state, including selected agents, source evidence, budget, checkpoints, and decision.",
    inputSchema: {
      includeFullAudit: z.boolean().default(false)
    }
  },
  async ({ includeFullAudit }) => {
    const state = getDemoState();
    return toolJson({
      state: compactState(state),
      blackboard: state.blackboard,
      audit: includeFullAudit ? state.audit : state.audit.slice(0, 5),
      checkpoints: includeFullAudit ? state.checkpoints : state.checkpoints.slice(0, 5)
    });
  }
);

server.registerTool(
  "team_manager_reset",
  {
    title: "Reset Team Manager",
    description: "Reset the room to a clean state and clear this run's MongoDB demo documents.",
    inputSchema: {}
  },
  async () => {
    const state = resetDemoState();
    await resetMongoDemo(state);
    setDemoState(state);
    logEvent("room.reset", {
      mongo: state.mongo.mode,
      db: state.mongo.dbName
    });
    return toolJson({
      message: "Team Manager reset.",
      state: compactState(state)
    });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  transport.onclose = async () => {
    await closeMongoClient();
  };
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await closeMongoClient();
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeMongoClient();
  await server.close();
  process.exit(0);
});

main().catch(async (error) => {
  await closeMongoClient();
  console.error(error);
  process.exit(1);
});
