import type { AgentProfile, CapabilityVector, GovernancePlan, ModelProfile, MongoWrite, PlannedAgent, RoutingStage } from "./types";
import { scoreAgents } from "./scoring";

const DEFAULT_WEIGHTS = {
  promptRelevance: 0.25,
  historicalSuccess: 0.35,
  recency: 0.1,
  latency: 0.15,
  tokenEfficiency: 0.15
};

function now(): string {
  return new Date().toISOString();
}

function modelProfile(kind: "manager" | "evidence" | "reviewer" | "summarizer"): ModelProfile {
  if (kind === "manager") {
    return {
      provider: "host",
      model: process.env.TEAM_MANAGER_MANAGER_MODEL ?? process.env.BOARDROOM_MANAGER_MODEL ?? "host-reasoning-high",
      temperature: 0.2,
      maxOutputTokens: 2400,
      reason: "The manager needs planning quality, tradeoff explanation, and user negotiation more than raw speed."
    };
  }

  if (kind === "reviewer") {
    return {
      provider: "host",
      model: process.env.TEAM_MANAGER_REVIEW_MODEL ?? process.env.BOARDROOM_REVIEW_MODEL ?? "host-reviewer-high-accuracy",
      temperature: 0.1,
      maxOutputTokens: 1800,
      reason: "Security and contract gates are high-risk; use the most reliable reviewer profile available in the MCP host."
    };
  }

  if (kind === "summarizer") {
    return {
      provider: "fireworks",
      model: process.env.TEAM_MANAGER_SUMMARIZER_MODEL ?? process.env.BOARDROOM_SUMMARIZER_MODEL ?? "fireworks-compact-summarizer",
      temperature: 0.1,
      maxOutputTokens: 1200,
      reason: "Summarization is latency-sensitive and benefits from a small, deterministic model profile."
    };
  }

  return {
    provider: "fireworks",
    model: process.env.TEAM_MANAGER_SPECIALIST_MODEL ?? process.env.BOARDROOM_SPECIALIST_MODEL ?? "fireworks-fast-evidence-worker",
    temperature: 0.2,
    maxOutputTokens: 1700,
    reason: "Evidence extraction and structured findings should be fast, low-temperature, and cheap enough for parallel specialists."
  };
}

function priority(agent: AgentProfile): PlannedAgent["priority"] {
  if (["agent-legal", "agent-risk", "agent-critic"].includes(agent.agentId)) {
    return "critical";
  }
  if (["agent-evidence", "agent-technical", "agent-finance", "agent-crypto", "agent-strategy"].includes(agent.agentId)) {
    return "high";
  }
  return "medium";
}

function budgetShare(agent: AgentProfile): number {
  const shares: Record<string, number> = {
    "agent-evidence": 0.18,
    "agent-technical": 0.15,
    "agent-market": 0.14,
    "agent-legal": 0.16,
    "agent-finance": 0.14,
    "agent-crypto": 0.16,
    "agent-risk": 0.13,
    "agent-strategy": 0.14,
    "agent-critic": 0.14
  };
  return shares[agent.agentId] ?? 0.14;
}

function modelForAgent(agent: AgentProfile): ModelProfile {
  if (["agent-legal", "agent-risk", "agent-critic"].includes(agent.agentId)) {
    return modelProfile("reviewer");
  }
  return modelProfile("evidence");
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

function plannedAgent(agent: AgentProfile, totalBudget: number, taskType: string): PlannedAgent {
  return {
    agentId: agent.agentId,
    name: agent.name,
    role: agent.role,
    priority: priority(agent),
    tokenBudget: Math.round((totalBudget * budgetShare(agent)) / 100) * 100,
    model: modelForAgent(agent),
    capabilityVector: capabilityVector(agent, taskType),
    delegationCapabilityScope: agent.capabilities.filter((capability) =>
      ["cite_sources", "write_blackboard", "read_blackboard", "request_evidence", "read_public_web"].includes(capability)
    ),
    memoryScopes: ["private", "team", "global"],
    blackboardTopK: 5,
    responsibilities: responsibilities(agent),
    successCriteria: successCriteria(agent)
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
      decision: "Use higher-accuracy reviewer profiles for critical risk gates and faster evidence workers for extraction lanes.",
      evidence: agents.map((agent) => `${agent.name}: ${agent.model.model} because ${agent.model.reason}`)
    },
    {
      stage: "budget_assignment",
      decision: `Use one group budget of ${totalTokenBudget.toLocaleString()} tokens with per-agent caps and manager/summarizer reserves.`,
      evidence: agents.map((agent) => `${agent.name}: ${agent.tokenBudget.toLocaleString()} token cap`)
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
}): GovernancePlan {
  const totalTokenBudget = options.totalTokenBudget ?? 50_000;
  const ranked = scoreAgents(options.request, options.taskType, options.candidates);
  const agents = ranked.slice(0, 5).map((agent) => plannedAgent(agent, totalTokenBudget, options.taskType));
  const managerReserve = Math.round(totalTokenBudget * 0.07);
  const summarizerReserve = Math.round(totalTokenBudget * 0.07);

  return {
    id: `${options.runId}-governance-plan`,
    status: "proposed",
    request: options.request,
    target: options.target,
    taskType: options.taskType,
    totalTokenBudget,
    collaborationMode: "manager_supervised_room",
    routingCascade: routingCascade(agents, totalTokenBudget),
    dispatchWeights: DEFAULT_WEIGHTS,
    budgetPolicy: {
      warningAt: 0.7,
      summarizeAt: 0.9,
      hardStopAt: 1,
      hardStopAction: "abort",
      managerReserve,
      summarizerReserve
    },
    memoryPolicy: {
      visibility: ["private", "team", "global"],
      defaultVisibility: "private",
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
      requireSourceLinkedClaims: true
    },
    teamManager: {
      model: modelProfile("manager"),
      questionsForUser: [
        `I am thinking of measuring agent fit as 25% task relevance, 35% historical success, 10% recency, 15% latency, and 15% token efficiency. Should token efficiency be weighted higher for this run?`,
        `I am thinking of initializing ${agents.map((agent) => agent.name).join(", ")}. Is any specialist missing or unnecessary?`,
        `I am thinking of a ${totalTokenBudget.toLocaleString()} token group budget with hard abort at 100%, warning at 70%, and summarization at 90%. Is that too conservative?`,
        `I am thinking of this routing cascade: ${routingCascade(agents, totalTokenBudget)
          .map((stage) => stage.stage)
          .join(" -> ")}. Should I remove any stage for speed?`,
        "I am thinking of MongoDB as the room state: agent_profiles for skills, tasks/groups for assignment, blackboard_entries for shared context, memory_cards for scoped memory, and audit for claim evidence. Does that collaboration model match the way you want this team to work?",
        "I am thinking of private-by-default memory, team promotion after 3 reuses, and source-linked audit for all decision claims. Should any evidence class stay private?",
        "I am picking high-accuracy reviewer profiles for risk/critic roles, faster evidence-worker profiles for research and analysis roles, and a compact summarizer. Do you prefer speed, cost, or caution?"
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
  const agents = plan.agents.map((agent) => ({
    ...agent,
    tokenBudget: options.agentBudgetOverrides?.[agent.agentId] ?? agent.tokenBudget
  }));
  const updated: GovernancePlan = {
    ...plan,
    status: options.approved ? "approved" : "revisions_requested",
    totalTokenBudget,
    agents,
    routingCascade: routingCascade(agents, totalTokenBudget),
    budgetPolicy: {
      ...plan.budgetPolicy,
      managerReserve: Math.round(totalTokenBudget * 0.07),
      summarizerReserve: Math.round(totalTokenBudget * 0.07)
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
