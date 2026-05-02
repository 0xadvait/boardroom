import type { AgentProfile, CapabilityVector, GovernancePlan, ModelProfile, MongoWrite, PlannedAgent, RoutingStage, TeamManagerPreferences } from "./types";
import { scoreAgents } from "./scoring";

const DEFAULT_WEIGHTS = {
  promptRelevance: 0.25,
  historicalSuccess: 0.35,
  recency: 0.1,
  latency: 0.15,
  tokenEfficiency: 0.15
};

export const TASK_COMPLEXITY_MULTIPLIER: Record<string, number> = {
  aesthetic_product_work: 1.08,
  trading_agent_system: 1.35,
  crypto_market_decision: 1.3,
  legal_risk: 1.25,
  technical_decision: 1.18,
  procurement_decision: 1.12,
  financial_analysis: 1.12,
  market_strategy: 1.1,
  general_decision: 1
};

function now(): string {
  return new Date().toISOString();
}

function configuredModel(
  envKeys: string[],
  fallbackSlot: string,
  fallbackProvider: ModelProfile["provider"],
  reason: string,
  temperature: number,
  maxOutputTokens: number,
  extra: Pick<ModelProfile, "reasoningEffort" | "executionClass"> = {},
  preferFallbackSlot = false
): ModelProfile {
  const configured = preferFallbackSlot ? fallbackSlot : envKeys.map((key) => process.env[key]).find((value): value is string => Boolean(value));
  return {
    provider: configured ? fallbackProvider : "configurable",
    model: configured ?? fallbackSlot,
    temperature,
    maxOutputTokens,
    ...extra,
    reason: configured ? reason : `${reason} Concrete model is selected by the MCP host or by env config at runtime.`
  };
}

function modelProfile(kind: "manager" | "logic" | "aesthetic" | "summarizer", preferences?: TeamManagerPreferences): ModelProfile {
  if (kind === "manager") {
    const preferred = preferences?.managerModel;
    return configuredModel(
      ["TEAM_MANAGER_MANAGER_MODEL", "TEAM_MANAGER_LOGIC_MODEL", "BOARDROOM_MANAGER_MODEL"],
      preferred ?? "gpt-5.5",
      "openai",
      "The manager needs the strongest reasoning profile for planning, tradeoffs, budget decisions, and user negotiation.",
      0.2,
      2400,
      {
        reasoningEffort: (preferences?.logicReasoningEffort ??
          process.env.TEAM_MANAGER_MANAGER_REASONING_EFFORT ??
          process.env.TEAM_MANAGER_LOGIC_REASONING_EFFORT ??
          "xhigh") as ModelProfile["reasoningEffort"],
        executionClass: "manager"
      },
      Boolean(preferred)
    );
  }

  if (kind === "logic") {
    const preferred = preferences?.logicModel;
    return configuredModel(
      ["TEAM_MANAGER_REVIEW_MODEL", "TEAM_MANAGER_LOGIC_MODEL", "TEAM_MANAGER_SPECIALIST_MODEL", "BOARDROOM_REVIEW_MODEL"],
      preferred ?? "gpt-5.5",
      "openai",
      "Logical, regulatory, financial, technical, and synthesis work should use the strongest reasoning profile available locally.",
      0.1,
      2200,
      {
        reasoningEffort: (preferences?.logicReasoningEffort ??
          process.env.TEAM_MANAGER_REVIEW_REASONING_EFFORT ??
          process.env.TEAM_MANAGER_LOGIC_REASONING_EFFORT ??
          "xhigh") as ModelProfile["reasoningEffort"],
        executionClass: "logic"
      },
      Boolean(preferred)
    );
  }

  if (kind === "aesthetic") {
    const preferred = preferences?.aestheticModel;
    return configuredModel(
      ["TEAM_MANAGER_AESTHETIC_MODEL", "TEAM_MANAGER_CLAUDE_MODEL", "BOARDROOM_AESTHETIC_MODEL"],
      preferred ?? "claude-opus-4-7",
      "claude",
      "UI, copy, README, narrative, and product-polish work benefits from a strong aesthetic and writing model profile.",
      0.35,
      2600,
      {
        executionClass: "aesthetic"
      },
      Boolean(preferred)
    );
  }

  if (kind === "summarizer") {
    const preferred = preferences?.summarizerModel;
    return configuredModel(
      ["TEAM_MANAGER_SUMMARIZER_MODEL", "TEAM_MANAGER_LOGIC_MODEL", "BOARDROOM_SUMMARIZER_MODEL"],
      preferred ?? "gpt-5.5",
      "openai",
      "Summarization must preserve decision logic, evidence links, and memory boundaries, so it uses the local reasoning profile.",
      0.1,
      1400,
      {
        reasoningEffort: (preferences?.logicReasoningEffort ??
          process.env.TEAM_MANAGER_SUMMARIZER_REASONING_EFFORT ??
          process.env.TEAM_MANAGER_LOGIC_REASONING_EFFORT ??
          "xhigh") as ModelProfile["reasoningEffort"],
        executionClass: "summarization"
      },
      Boolean(preferred)
    );
  }

  return modelProfile("logic", preferences);
}

function priority(agent: AgentProfile): PlannedAgent["priority"] {
  if (["agent-legal", "agent-risk", "agent-critic"].includes(agent.agentId)) {
    return "critical";
  }
  if (["agent-evidence", "agent-technical", "agent-finance", "agent-crypto", "agent-strategy", "agent-design"].includes(agent.agentId)) {
    return "high";
  }
  return "medium";
}

function isAestheticAgent(agent: AgentProfile): boolean {
  return (
    agent.agentId === "agent-design" ||
    agent.skills.some((skill) =>
      ["aesthetic_product_work", "ui_polish", "ux", "frontend", "visual_design", "copywriting", "text_polish", "readme", "presentation_narrative"].includes(
        skill
      )
    )
  );
}

function modelForAgent(agent: AgentProfile, taskType: string, preferences?: TeamManagerPreferences): ModelProfile {
  if (taskType === "aesthetic_product_work" || isAestheticAgent(agent)) {
    return modelProfile("aesthetic", preferences);
  }
  return modelProfile("logic", preferences);
}

export function roughTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.35));
}

export function requestComplexityScore(request: string, taskType: string): number {
  const lower = request.toLowerCase();
  const riskSignals = [
    "regulatory",
    "legal",
    "compliance",
    "security",
    "financial",
    "audit",
    "public sources",
    "sources",
    "checkpoint",
    "private",
    "budget",
    "multi-agent",
    "exchange",
    "listing"
  ].filter((signal) => lower.includes(signal)).length;
  const taskMultiplier = TASK_COMPLEXITY_MULTIPLIER[taskType] ?? 1;
  const lengthComponent = Math.min(2.2, roughTokenCount(request) / 160);
  return (1 + lengthComponent + riskSignals * 0.14) * taskMultiplier;
}

export function selectedAgentHistoricalTokens(taskType: string, agents: AgentProfile[]): number {
  return agents.reduce((sum, agent) => sum + historicalTokensForAgent(agent, taskType), 0) || 24_000;
}

export function coordinationOverheadTokens(request: string, agents: AgentProfile[]): number {
  return Math.round((agents.length + 1) * roughTokenCount(request) * 16);
}

export function estimateTotalTokenBudget(request: string, taskType: string, agents: AgentProfile[]): number {
  const complexity = requestComplexityScore(request, taskType);
  const historicalNeed = selectedAgentHistoricalTokens(taskType, agents);
  const coordinationOverhead = coordinationOverheadTokens(request, agents);
  const estimate = Math.round((historicalNeed * complexity + coordinationOverhead) / 1000) * 1000;
  return Math.min(120_000, Math.max(22_000, estimate));
}

export function reserveRatio(taskType: string, request: string): number {
  const complexity = requestComplexityScore(request, taskType);
  if (complexity >= 2.2) {
    return 0.18;
  }
  if (complexity >= 1.7) {
    return 0.16;
  }
  return 0.14;
}

export function historicalTokensForAgent(agent: AgentProfile, taskType: string): number {
  const proven = agent.provenSkills[taskType] ?? agent.provenSkills.general_decision;
  return proven?.avgTokens ?? Math.round(agent.avgDurationMs / 4);
}

export function budgetDemand(agent: AgentProfile, taskType: string): number {
  const historicalTokens = historicalTokensForAgent(agent, taskType);
  const priorityLevel = priority(agent);
  const priorityMultiplier = priorityLevel === "critical" ? 1.22 : priorityLevel === "high" ? 1.08 : 1;
  const proven = agent.provenSkills[taskType];
  const coldStartMultiplier = proven && proven.runs >= 3 ? 1 : 1.12;
  const scoreMultiplier = 0.85 + (agent.score?.matchScore ?? 0.5) * 0.35;
  return Math.max(1, historicalTokens * priorityMultiplier * coldStartMultiplier * scoreMultiplier);
}

function buildBudgetEstimate(options: {
  request: string;
  taskType: string;
  selected: AgentProfile[];
  planned: PlannedAgent[];
  estimatedTotal: number;
  finalTotal: number;
  manualOverride: boolean;
}): GovernancePlan["budgetEstimate"] {
  const complexity = requestComplexityScore(options.request, options.taskType);
  const historicalNeed = selectedAgentHistoricalTokens(options.taskType, options.selected);
  const overhead = coordinationOverheadTokens(options.request, options.selected);
  const reserveTokens = Math.round(options.finalTotal * reserveRatio(options.taskType, options.request));
  const plannedById = new Map(options.planned.map((agent) => [agent.agentId, agent]));

  return {
    mode: options.manualOverride ? "manual_override" : "task_estimated",
    formula:
      "clamp_22k_120k(round_1k(selected_agent_historical_tokens * task_complexity_score + coordination_overhead_tokens)); per-agent caps allocate final budget minus reserves by historical tokens, role criticality, capability score, and cold-start uncertainty.",
    requestTokenEstimate: roughTokenCount(options.request),
    taskComplexityScore: Number(complexity.toFixed(3)),
    selectedAgentHistoricalTokens: historicalNeed,
    coordinationOverheadTokens: overhead,
    reserveTokens,
    estimatedTotalTokens: options.estimatedTotal,
    finalTotalTokens: options.finalTotal,
    agentDemand: options.selected.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      historicalTokens: historicalTokensForAgent(agent, options.taskType),
      priority: priority(agent),
      demandScore: Math.round(budgetDemand(agent, options.taskType)),
      allocatedTokens: plannedById.get(agent.agentId)?.tokenBudget ?? 0
    }))
  };
}

function capabilityVector(agent: AgentProfile, taskType: string): CapabilityVector {
  const proven = agent.provenSkills[taskType] ?? {
    successRate: 0.5,
    avgDurationMs: agent.avgDurationMs,
    avgTokens: 7000,
    runs: 0
  };

  return {
    version: "vcv-2026-05-02",
    declaredSkills: agent.skills,
    capabilities: agent.capabilities,
    provenTaskType: taskType,
    successRate: proven.successRate,
    avgDurationMs: proven.avgDurationMs,
    avgTokens: proven.avgTokens,
    runs: proven.runs,
    tokenEfficiency: agent.tokenEfficiency,
    lastPerformedAt: agent.lastPerformedAt,
    constraints: [
      "Must cite source evidence before publishing decision claims.",
      "May only read private memory owned by this agent; team/global memory is shared by policy.",
      "Delegated capability scope is intersected with the manager's room capabilities."
    ]
  };
}

function responsibilities(agent: AgentProfile): string[] {
  const base: Record<string, string[]> = {
    "agent-evidence": [
      "Find reliable primary sources for the user request.",
      "Extract only source-linked facts into the blackboard.",
      "Flag missing evidence instead of filling gaps with assumptions."
    ],
    "agent-technical": [
      "Assess technical feasibility, integration path, and implementation risk.",
      "Translate technical blockers into concrete questions for the user.",
      "Post architecture or execution constraints to the blackboard."
    ],
    "agent-design": [
      "Improve UI, copy, README, presentation narrative, and aesthetic quality when the task has a product-facing surface.",
      "Translate polish work into concrete implementation or editorial changes.",
      "Keep aesthetic recommendations grounded in the user's audience and the current artifact."
    ],
    "agent-market": [
      "Map market, customer, competitor, and ecosystem implications.",
      "Separate durable market signals from noisy anecdotes.",
      "Post opportunity and positioning findings with source links."
    ],
    "agent-legal": [
      "Identify compliance, regulatory, contractual, and policy gates.",
      "Subscribe to technical and market findings that create legal exposure.",
      "Escalate unresolved approval blockers before final synthesis."
    ],
    "agent-finance": [
      "Estimate cost, ROI, revenue, and budget implications.",
      "Make assumptions explicit and keep calculations auditable.",
      "Post commercial tradeoffs to the shared blackboard."
    ],
    "agent-crypto": [
      "Analyze exchange, liquidity, custody, token, and market-structure implications.",
      "Translate crypto-specific risks into business decision terms.",
      "Post source-linked crypto market findings and open questions."
    ],
    "agent-trading": [
      "Design trading-agent architecture, market-data flow, backtesting, execution controls, and risk limits.",
      "Separate strategy logic from safety, monitoring, and operator override requirements.",
      "Post implementation and risk-control findings to the blackboard."
    ],
    "agent-risk": [
      "Aggregate cross-functional risks and mitigations.",
      "Track unresolved blockers raised by other specialists.",
      "Prevent premature final decisions while critical risks are open."
    ],
    "agent-strategy": [
      "Clarify options, tradeoffs, and second-order effects.",
      "Keep the room aligned to the user's actual objective.",
      "Post decision framing and priority conflicts."
    ],
    "agent-critic": [
      "Challenge weak claims and unsupported consensus.",
      "Detect contradictions between blackboard entries.",
      "Prepare the final audited recommendation only from cited evidence."
    ]
  };

  return base[agent.agentId] ?? [`Evaluate ${agent.role.toLowerCase()} concerns for the requested task.`];
}

function successCriteria(agent: AgentProfile): string[] {
  return [
    "Every material claim links to a blackboard entry.",
    "Every blackboard claim links to at least one source document or promoted memory card.",
    `Stay under the assigned ${agent.name} token cap unless the manager explicitly reallocates budget.`
  ];
}

function plannedAgent(agent: AgentProfile, tokenBudget: number, taskType: string, preferences?: TeamManagerPreferences): PlannedAgent {
  return {
    agentId: agent.agentId,
    name: agent.name,
    role: agent.role,
    priority: priority(agent),
    tokenBudget,
    model: modelForAgent(agent, taskType, preferences),
    capabilityVector: capabilityVector(agent, taskType),
    delegationCapabilityScope: agent.capabilities.filter((capability) =>
      ["cite_sources", "write_blackboard", "read_blackboard", "request_evidence", "read_public_web"].includes(capability)
    ),
    memoryScopes:
      preferences?.defaultMemoryVisibility === "team"
        ? ["team", "global"]
        : preferences?.defaultMemoryVisibility === "global"
          ? ["global"]
          : ["private", "team", "global"],
    blackboardTopK: 5,
    responsibilities: responsibilities(agent),
    successCriteria: successCriteria(agent)
  };
}

function plannedAgents(
  agents: AgentProfile[],
  totalBudget: number,
  taskType: string,
  request: string,
  preferences?: TeamManagerPreferences
): PlannedAgent[] {
  const reserve = Math.round(totalBudget * reserveRatio(taskType, request));
  const allocatable = Math.max(10_000, totalBudget - reserve);
  const demands = agents.map((agent) => budgetDemand(agent, taskType));
  const demandTotal = demands.reduce((sum, demand) => sum + demand, 0);

  return agents.map((agent, index) => {
    const tokenBudget = Math.max(2500, Math.round((allocatable * (demands[index] / demandTotal)) / 100) * 100);
    return plannedAgent(agent, tokenBudget, taskType, preferences);
  });
}

function rebalancePlannedAgents(
  plan: GovernancePlan,
  totalBudget: number,
  overrides: Record<string, number> | undefined
): PlannedAgent[] {
  const reserve = Math.round(totalBudget * reserveRatio(plan.taskType, plan.request));
  const allocatable = Math.max(10_000, totalBudget - reserve);
  const demandById = new Map(plan.budgetEstimate.agentDemand.map((item) => [item.agentId, item.demandScore]));
  const overriddenTotal = Object.values(overrides ?? {}).reduce((sum, value) => sum + value, 0);
  const remainingBudget = Math.max(0, allocatable - overriddenTotal);
  const nonOverridden = plan.agents.filter((agent) => !overrides?.[agent.agentId]);
  const remainingDemand = nonOverridden.reduce((sum, agent) => sum + (demandById.get(agent.agentId) ?? agent.tokenBudget), 0);

  return plan.agents.map((agent) => {
    const override = overrides?.[agent.agentId];
    if (override) {
      return { ...agent, tokenBudget: override };
    }
    const demand = demandById.get(agent.agentId) ?? agent.tokenBudget;
    const tokenBudget =
      remainingDemand > 0 ? Math.max(2500, Math.round((remainingBudget * (demand / remainingDemand)) / 100) * 100) : agent.tokenBudget;
    return { ...agent, tokenBudget };
  });
}

function updateBudgetEstimateForPlan(
  plan: GovernancePlan,
  totalBudget: number,
  agents: PlannedAgent[],
  manualOverride: boolean
): GovernancePlan["budgetEstimate"] {
  const reserveTokens = Math.round(totalBudget * reserveRatio(plan.taskType, plan.request));
  const agentDemand = plan.budgetEstimate.agentDemand.map((item) => ({
    ...item,
    allocatedTokens: agents.find((agent) => agent.agentId === item.agentId)?.tokenBudget ?? item.allocatedTokens
  }));

  return {
    ...plan.budgetEstimate,
    mode: manualOverride ? "manual_override" : plan.budgetEstimate.mode,
    reserveTokens,
    finalTotalTokens: totalBudget,
    agentDemand
  };
}

function routingCascade(agents: PlannedAgent[], totalTokenBudget: number): RoutingStage[] {
  return [
    {
      stage: "collaboration_mode",
      decision: "Use a manager-supervised specialist room, not a single autonomous agent.",
      evidence: [
        "The request benefits from independent specialist perspectives and one manager enforcing budget, memory, and audit rules.",
        "The manager keeps approval, budget, memory, and final synthesis centralized."
      ]
    },
    {
      stage: "candidate_retrieval",
      decision: "Retrieve 12 candidates from MongoDB agent_profiles by semantic task relevance.",
      evidence: [
        "Each agent profile has declared skills, capabilities, description_embedding, and historical performance.",
        "The Atlas implementation path is $vectorSearch over description_embedding followed by performance lookup."
      ]
    },
    {
      stage: "capability_scoring",
      decision: "Rank candidates with the weighted capability formula and select the top five.",
      evidence: [
        "Weights are 25% prompt relevance, 35% historical success, 10% recency, 15% latency, and 15% token efficiency.",
        `Selected agents: ${agents.map((agent) => agent.name).join(", ")}.`
      ]
    },
    {
      stage: "role_allocation",
      decision: "Allocate specialists to the highest-scoring capability lanes for this request.",
      evidence: agents.map((agent) => `${agent.name}: ${agent.role}`)
    },
    {
      stage: "model_assignment",
      decision: "Assign execution profiles, not hard-coded models: high-accuracy reviewer slots for critical gates and fast evidence-worker slots for extraction lanes.",
      evidence: agents.map((agent) => `${agent.name}: ${agent.model.model} because ${agent.model.reason}`)
    },
    {
      stage: "budget_assignment",
      decision: `Use one task-estimated group budget of ${totalTokenBudget.toLocaleString()} tokens with per-agent caps and manager/summarizer reserves.`,
      evidence: [
        "Budget estimate uses request complexity, task type risk, selected agents' historical avg tokens, role criticality, and cold-start uncertainty.",
        ...agents.map((agent) => `${agent.name}: ${agent.tokenBudget.toLocaleString()} token cap`)
      ]
    },
    {
      stage: "memory_boundary",
      decision: "Use private-by-default memory, team/global retrieval filters, and source-linked audit before final claims.",
      evidence: [
        "Private memory requires owner_agent_id match.",
        "Team memory requires team_id match.",
        "Global memory is visible to all room agents."
      ]
    }
  ];
}

export function buildGovernancePlan(options: {
  runId: string;
  request: string;
  target: string;
  taskType: string;
  candidates: AgentProfile[];
  totalTokenBudget?: number;
  preferences?: TeamManagerPreferences;
}): GovernancePlan {
  const ranked = scoreAgents(options.request, options.taskType, options.candidates);
  const selected = ranked.slice(0, Math.min(8, Math.max(1, options.preferences?.defaultMaxAgents ?? 5)));
  const estimatedTotalBudget = estimateTotalTokenBudget(options.request, options.taskType, selected);
  const totalTokenBudget = options.totalTokenBudget ?? estimatedTotalBudget;
  const agents = plannedAgents(selected, totalTokenBudget, options.taskType, options.request, options.preferences);
  const totalReserveRatio = reserveRatio(options.taskType, options.request);
  const managerReserve = Math.round(totalTokenBudget * (totalReserveRatio / 2));
  const summarizerReserve = Math.round(totalTokenBudget * (totalReserveRatio / 2));
  const budgetEstimate = buildBudgetEstimate({
    request: options.request,
    taskType: options.taskType,
    selected,
    planned: agents,
    estimatedTotal: estimatedTotalBudget,
    finalTotal: totalTokenBudget,
    manualOverride: Boolean(options.totalTokenBudget)
  });

  return {
    id: `${options.runId}-governance-plan`,
    status: "proposed",
    request: options.request,
    target: options.target,
    taskType: options.taskType,
    totalTokenBudget,
    budgetEstimate,
    collaborationMode: "manager_supervised_room",
    routingCascade: routingCascade(agents, totalTokenBudget),
    dispatchWeights: DEFAULT_WEIGHTS,
    budgetPolicy: {
      warningAt: 0.7,
      summarizeAt: 0.9,
      hardStopAt: 1,
      hardStopAction: options.preferences?.budgetHardStopAction ?? "abort",
      managerReserve,
      summarizerReserve
    },
    memoryPolicy: {
      visibility: ["private", "team", "global"],
      defaultVisibility: options.preferences?.defaultMemoryVisibility ?? "private",
      promotionRule: "Promote to team memory after 3 distinct agents reuse or cite the item.",
      sensitiveDataRule: "Keep credentials, PII, private contracts, and unverified claims private unless the user approves promotion."
    },
    blackboardPolicy: {
      writeSemantics: "Append-only source-linked posts; agents never mutate another agent's findings.",
      subscriptionRule: "Agents query top-k relevant blackboard, memory, and source evidence for their current subtask.",
      noiseControl: "Private findings stay out of team context until 3-agent reuse or critic ratification promotes them."
    },
    retrievalPolicy: {
      blackboardTopK: 5,
      memoryTopK: 5,
      sourceTopK: 6,
      requireSourceLinkedClaims: options.preferences?.requireSourceLinkedClaims ?? true
    },
    teamManager: {
      model: modelProfile("manager", options.preferences),
      questionsForUser: [
        `I am thinking of measuring agent fit as 25% task relevance, 35% historical success, 10% recency, 15% latency, and 15% token efficiency. Should token efficiency be weighted higher for this run?`,
        `I am thinking of initializing ${agents.map((agent) => agent.name).join(", ")}. Is any specialist missing or unnecessary?`,
        `I estimated a ${totalTokenBudget.toLocaleString()} token group budget from task complexity (${budgetEstimate.taskComplexityScore}), selected agents' historical token use (${budgetEstimate.selectedAgentHistoricalTokens.toLocaleString()}), coordination overhead (${budgetEstimate.coordinationOverheadTokens.toLocaleString()}), role criticality, and low-history uncertainty. Is that too conservative?`,
        `I am thinking of this routing cascade: ${routingCascade(agents, totalTokenBudget)
          .map((stage) => stage.stage)
          .join(" -> ")}. Should I remove any stage for speed?`,
        "I am thinking of MongoDB as the room state: agent_profiles for skills, tasks/groups for assignment, blackboard_entries for shared context, memory_cards for scoped memory, and audit for claim evidence. Does that collaboration model match the way you want this team to work?",
        "I am thinking of private-by-default memory, team promotion after 3 reuses, and source-linked audit for all decision claims. Should any evidence class stay private?",
        `I am using your local preferences: optimization=${options.preferences?.optimizationPreference ?? "balanced"}, source_provider=${options.preferences?.sourceProviderPreference ?? "auto"}, max_agents=${options.preferences?.defaultMaxAgents ?? 5}, hard_stop=${options.preferences?.budgetHardStopAction ?? "abort"}. Do you want to change any of these before agents start?`
      ],
      assumptions: [
        "The manager should infer a useful specialist room from the user's request, then ask for approval before execution.",
        "The manager should keep final decision authority with the user instead of letting agents take irreversible actions.",
        "The room should optimize for visible governance: source-linked claims, scoped memory, budget control, and recoverability."
      ]
    },
    agents,
    priorities: [
      "Do not let any specialist write unaudited final claims.",
      "Prefer fewer, source-backed blackboard entries over noisy status chatter.",
      "Spend the first tokens on live evidence ingestion, not agent debate.",
      "Preserve checkpoints before risky transitions and before final synthesis."
    ],
    createdAt: now()
  };
}

export function governancePlanWrites(plan: GovernancePlan): MongoWrite[] {
  return [
    {
      collection: "governance_plans",
      operation: "insertOne",
      document: {
        _id: plan.id,
        plan_id: plan.id,
        status: plan.status,
        request: plan.request,
        target: plan.target,
        task_type: plan.taskType,
        total_token_budget: plan.totalTokenBudget,
        budget_estimate: plan.budgetEstimate,
        collaboration_mode: plan.collaborationMode,
        routing_cascade: plan.routingCascade,
        dispatch_weights: plan.dispatchWeights,
        budget_policy: plan.budgetPolicy,
        memory_policy: plan.memoryPolicy,
        blackboard_policy: plan.blackboardPolicy,
        retrieval_policy: plan.retrievalPolicy,
        team_manager: plan.teamManager,
        agents: plan.agents,
        priorities: plan.priorities,
        created_at: new Date(plan.createdAt)
      }
    },
    {
      collection: "audit",
      operation: "insertOne",
      document: {
        _id: `${plan.id}-audit-proposed`,
        event_type: "governance_plan_proposed",
        plan_id: plan.id,
        status: plan.status,
        questions_for_user: plan.teamManager.questionsForUser,
        created_at: new Date(plan.createdAt)
      }
    }
  ];
}

export function approveGovernancePlan(
  plan: GovernancePlan,
  options: {
    approved: boolean;
    userNotes?: string;
    totalTokenBudget?: number;
    agentBudgetOverrides?: Record<string, number>;
  }
): { plan: GovernancePlan; writes: MongoWrite[] } {
  const approvedAt = now();
  const totalTokenBudget = options.totalTokenBudget ?? plan.totalTokenBudget;
  const agents =
    options.totalTokenBudget || options.agentBudgetOverrides
      ? rebalancePlannedAgents(plan, totalTokenBudget, options.agentBudgetOverrides)
      : plan.agents;
  const budgetEstimate = updateBudgetEstimateForPlan(plan, totalTokenBudget, agents, Boolean(options.totalTokenBudget));
  const totalReserveRatio = reserveRatio(plan.taskType, plan.request);
  const updated: GovernancePlan = {
    ...plan,
    status: options.approved ? "approved" : "revisions_requested",
    totalTokenBudget,
    budgetEstimate,
    agents,
    routingCascade: routingCascade(agents, totalTokenBudget),
    budgetPolicy: {
      ...plan.budgetPolicy,
      managerReserve: Math.round(totalTokenBudget * (totalReserveRatio / 2)),
      summarizerReserve: Math.round(totalTokenBudget * (totalReserveRatio / 2))
    },
    approvedAt: options.approved ? approvedAt : undefined,
    userNotes: options.userNotes
  };

  return {
    plan: updated,
    writes: [
      {
        collection: "governance_plans",
        operation: "updateOne",
        filter: { _id: plan.id },
        update: {
          $set: {
            status: updated.status,
            total_token_budget: updated.totalTokenBudget,
            budget_estimate: updated.budgetEstimate,
            routing_cascade: updated.routingCascade,
            budget_policy: updated.budgetPolicy,
            agents: updated.agents,
            approved_at: updated.approvedAt ? new Date(updated.approvedAt) : undefined,
            user_notes: updated.userNotes
          }
        }
      },
      {
        collection: "audit",
        operation: "insertOne",
        document: {
          _id: `${plan.id}-audit-${updated.status}`,
          event_type: "governance_plan_decision",
          plan_id: plan.id,
          status: updated.status,
          user_notes: updated.userNotes,
          created_at: new Date(approvedAt)
        }
      }
    ]
  };
}
