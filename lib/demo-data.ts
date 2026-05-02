import type { AgentProfile, SourceRef } from "./types";
import { pseudoEmbedding } from "./scoring";

const defaultTaskType = "general_decision";

function agent(
  agentId: string,
  name: string,
  role: string,
  description: string,
  skills: string[],
  capabilities: string[],
  successRate: number,
  avgDurationMs: number,
  tokenEfficiency: number,
  lastPerformedAt: string
): AgentProfile {
  return {
    agentId,
    name,
    role,
    description,
    skills,
    capabilities,
    descriptionEmbedding: pseudoEmbedding(`${name} ${role} ${description} ${skills.join(" ")}`),
    provenSkills: {
      [defaultTaskType]: {
        successRate,
        avgDurationMs,
        avgTokens: Math.round(6800 / tokenEfficiency),
        runs: Math.round(20 + successRate * 80)
      }
    },
    avgDurationMs,
    tokenEfficiency,
    lastPerformedAt,
    status: "candidate",
    selected: false,
    tokensUsed: 0,
    currentStep: "Waiting in capability registry"
  };
}

export const DEFAULT_SOURCES: SourceRef[] = [];

export function createAgentProfiles(): AgentProfile[] {
  return [
    agent(
      "agent-evidence",
      "EvidenceScout",
      "Primary research and evidence specialist",
      "Finds reliable public sources, extracts relevant facts, separates evidence from claims, and writes source-linked discoveries for any complex question.",
      ["research", "evidence", "source_triage", "fact_extraction", "web_research"],
      ["read_public_web", "cite_sources", "write_blackboard", "query_context"],
      0.94,
      41_000,
      0.88,
      "2026-05-02T10:50:00+01:00"
    ),
    agent(
      "agent-technical",
      "TechnicalFit",
      "Technical architecture and implementation specialist",
      "Evaluates APIs, architecture, integration paths, data flows, migration risk, implementation complexity, and operational fit.",
      ["technical_decision", "architecture", "integration", "api_review", "implementation"],
      ["read_docs", "check_api", "cite_sources", "write_blackboard"],
      0.91,
      38_000,
      0.92,
      "2026-05-02T11:05:00+01:00"
    ),
    agent(
      "agent-market",
      "MarketMapper",
      "Market, ecosystem, and competitor analyst",
      "Maps market structure, competitors, customer demand, ecosystem incentives, positioning, distribution, and adoption signals.",
      ["market_strategy", "competitor_analysis", "customer_evidence", "positioning", "ecosystem"],
      ["read_public_web", "cite_sources", "write_blackboard"],
      0.88,
      43_000,
      0.86,
      "2026-05-02T10:58:00+01:00"
    ),
    agent(
      "agent-legal",
      "LegalRisk",
      "Legal, compliance, and policy risk analyst",
      "Identifies legal constraints, compliance gates, regulatory issues, contract red flags, privacy concerns, and approval blockers.",
      ["legal_risk", "compliance", "policy", "regulation", "contract_red_flags"],
      ["read_blackboard", "request_evidence", "write_blackboard", "cite_sources"],
      0.9,
      36_000,
      0.89,
      "2026-05-02T11:12:00+01:00"
    ),
    agent(
      "agent-finance",
      "FinanceModeler",
      "Financial impact and cost analyst",
      "Models costs, ROI, pricing, revenue exposure, unit economics, budget risk, runway impact, and commercial tradeoffs.",
      ["financial_analysis", "pricing_analysis", "roi", "cost_modeling", "commercial_strategy"],
      ["model_cost", "cite_sources", "write_blackboard", "query_context"],
      0.89,
      44_000,
      0.87,
      "2026-05-02T11:01:00+01:00"
    ),
    agent(
      "agent-crypto",
      "CryptoMarket",
      "Crypto, exchange, and market-structure analyst",
      "Analyzes token listings, exchange strategy, custody, liquidity, market-maker implications, blockchain ecosystem risk, and crypto-specific go-to-market decisions.",
      ["crypto_market_decision", "exchange_listing", "token_listing", "liquidity", "custody", "blockchain"],
      ["read_public_web", "cite_sources", "write_blackboard", "query_context"],
      0.78,
      55_000,
      0.78,
      "2026-04-27T09:00:00+01:00"
    ),
    agent(
      "agent-ops",
      "OpsPlanner",
      "Operational execution and rollout planner",
      "Turns a decision into execution steps, owners, dependencies, risk controls, checkpoints, timelines, and rollback criteria.",
      ["operations", "rollout_plan", "dependency_mapping", "project_management"],
      ["plan_rollout", "write_blackboard", "record_checkpoint"],
      0.75,
      58_000,
      0.8,
      "2026-04-25T15:00:00+01:00"
    ),
    agent(
      "agent-risk",
      "RiskRegister",
      "Cross-functional risk register owner",
      "Aggregates risks across legal, technical, financial, operational, and market workstreams; tracks mitigations and unresolved blockers.",
      ["risk_register", "decision_risk", "mitigation", "governance"],
      ["read_blackboard", "request_evidence", "write_blackboard"],
      0.73,
      61_000,
      0.76,
      "2026-04-18T09:00:00+01:00"
    ),
    agent(
      "agent-implementation",
      "ImplementationPM",
      "Implementation and stakeholder coordination agent",
      "Plans phases, stakeholder communication, migration, adoption, dependencies, decision owners, and sequencing for approved work.",
      ["implementation_plan", "stakeholders", "migration", "change_management"],
      ["plan_rollout", "write_blackboard"],
      0.72,
      47_000,
      0.84,
      "2026-04-30T09:30:00+01:00"
    ),
    agent(
      "agent-user",
      "UserImpact",
      "Customer, user, and stakeholder impact analyst",
      "Evaluates user experience, adoption friction, customer impact, internal workflow change, and stakeholder incentives.",
      ["user_impact", "adoption", "stakeholders", "workflow", "customer_impact"],
      ["write_blackboard", "request_evidence"],
      0.69,
      40_000,
      0.91,
      "2026-04-24T12:00:00+01:00"
    ),
    agent(
      "agent-strategy",
      "StrategyLead",
      "Strategic fit and decision framing analyst",
      "Frames the decision, clarifies options, compares strategic tradeoffs, identifies second-order effects, and keeps the room aligned with the user's objective.",
      ["strategy", "decision_framing", "roadmap", "tradeoffs", "prioritization"],
      ["read_public_web", "write_blackboard"],
      0.71,
      53_000,
      0.77,
      "2026-04-22T12:00:00+01:00"
    ),
    agent(
      "agent-critic",
      "SynthesisCritic",
      "Synthesis, contradiction, and evidence-quality critic",
      "Challenges weak claims, checks source coverage, detects contradictions across agents, and prepares the final audited recommendation.",
      ["synthesis", "critic", "evidence_quality", "contradiction_check", "final_decision"],
      ["read_blackboard", "cite_sources", "write_blackboard", "emit_decision"],
      0.68,
      49_000,
      0.82,
      "2026-04-19T12:00:00+01:00"
    )
  ];
}

export const TASK_PROMPT =
  "Evaluate an important decision or complex task. Plan the specialist room, enforce source-linked claims, keep scoped memory boundaries, manage a group token budget, and return an audited recommendation.";
