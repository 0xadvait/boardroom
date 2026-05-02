import type { AgentProfile, SourceRef } from "./types";
import { pseudoEmbedding } from "./scoring";

const taskType = "vendor_evaluation";

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
      [taskType]: {
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

export const VENDOR_SOURCES: SourceRef[] = [
  {
    id: "src-posthog-trust",
    title: "PostHog Trust Center",
    url: "https://trust.posthog.com/",
    note: "Public trust portal lists compliance documents and SOC 2 Type II coverage; report access still needs procurement verification."
  },
  {
    id: "src-posthog-pricing",
    title: "PostHog Pricing",
    url: "https://posthog.com/pricing",
    note: "Official pricing page shows free monthly tiers, usage-based overage rates, product-specific billing limits, and longer retention on paid plans."
  },
  {
    id: "src-posthog-product",
    title: "PostHog Product OS",
    url: "https://posthog.com/",
    note: "Product page describes one stack with analytics, session replay, feature flags, data warehouse, API, webhooks, and many sources/destinations."
  },
  {
    id: "src-posthog-open-source",
    title: "PostHog Open Source Notes",
    url: "https://posthog.com/blog/the-hidden-benefits-of-being-an-open-source-startup",
    note: "Public company writing describes the open-source footprint and enterprise licensing boundary."
  }
];

export function createAgentProfiles(): AgentProfile[] {
  return [
    agent(
      "agent-security",
      "SecurityReview",
      "Security and compliance specialist",
      "Reviews trust centers, SOC 2 reports, encryption controls, data residency, DPA posture, and enterprise procurement risk for SaaS analytics vendors.",
      ["security_review", "trust_center", "soc2", "vendor_risk", "privacy"],
      ["read_trust_center", "cite_sources", "request_private_report", "write_blackboard"],
      0.94,
      41_000,
      0.88,
      "2026-05-02T10:50:00+01:00"
    ),
    agent(
      "agent-pricing",
      "PricingAnalyst",
      "Usage pricing and commercial model analyst",
      "Models analytics vendor pricing, billing limits, free-tier thresholds, contract minimums, and cost exposure under usage growth.",
      ["pricing_analysis", "usage_modeling", "procurement", "forecasting"],
      ["read_pricing", "model_cost", "cite_sources", "write_blackboard"],
      0.91,
      38_000,
      0.92,
      "2026-05-02T11:05:00+01:00"
    ),
    agent(
      "agent-references",
      "ReferenceChecker",
      "Customer evidence and market reference checker",
      "Checks public customer references, review signals, recognisable logos, case studies, and market trust for analytics vendors.",
      ["reference_check", "market_evidence", "customer_logos", "reviews"],
      ["read_public_web", "cite_sources", "write_blackboard"],
      0.88,
      43_000,
      0.86,
      "2026-05-02T10:58:00+01:00"
    ),
    agent(
      "agent-integration",
      "IntegrationFit",
      "Implementation and systems integration specialist",
      "Evaluates SDKs, warehouse links, APIs, webhooks, sources, destinations, identity fit, and integration complexity for product analytics.",
      ["integration_fit", "api_review", "data_stack", "implementation"],
      ["read_docs", "check_api", "write_blackboard", "cite_sources"],
      0.9,
      36_000,
      0.89,
      "2026-05-02T11:12:00+01:00"
    ),
    agent(
      "agent-contracts",
      "ContractRedFlags",
      "Legal and procurement red-flag analyst",
      "Finds contract blockers, missing evidence artifacts, data processing concerns, audit clauses, support terms, and unresolved vendor risks.",
      ["contract_red_flags", "legal_review", "procurement_gate", "risk_register"],
      ["read_blackboard", "legal_review", "request_evidence", "write_blackboard"],
      0.89,
      44_000,
      0.87,
      "2026-05-02T11:01:00+01:00"
    ),
    agent(
      "agent-privacy",
      "DataPrivacy",
      "Privacy and data processing analyst",
      "Reviews GDPR, CCPA, HIPAA claims, subprocessors, data retention, and privacy-by-design posture for analytics vendors.",
      ["privacy", "gdpr", "ccpa", "subprocessors"],
      ["read_trust_center", "privacy_review", "write_blackboard"],
      0.78,
      55_000,
      0.78,
      "2026-04-27T09:00:00+01:00"
    ),
    agent(
      "agent-sla",
      "SLAReviewer",
      "Availability, support, and SLA analyst",
      "Reviews status pages, uptime language, escalation paths, paid support terms, and operational readiness for SaaS vendors.",
      ["sla_review", "support_terms", "availability"],
      ["read_public_web", "write_blackboard"],
      0.75,
      58_000,
      0.8,
      "2026-04-25T15:00:00+01:00"
    ),
    agent(
      "agent-finance",
      "FinancialRisk",
      "Vendor financial health analyst",
      "Checks funding, runway, pricing stability, public company signals, and buyer concentration risk for vendor diligence.",
      ["financial_risk", "funding", "market_risk"],
      ["read_public_web", "write_blackboard"],
      0.73,
      61_000,
      0.76,
      "2026-04-18T09:00:00+01:00"
    ),
    agent(
      "agent-implementation",
      "ImplementationPM",
      "Rollout planning agent",
      "Plans deployment phases, adoption milestones, stakeholder comms, and implementation dependencies after vendor approval.",
      ["implementation_plan", "stakeholders", "migration"],
      ["plan_rollout", "write_blackboard"],
      0.72,
      47_000,
      0.84,
      "2026-04-30T09:30:00+01:00"
    ),
    agent(
      "agent-procurement",
      "ProcurementOps",
      "Buying process and intake analyst",
      "Tracks purchase intake, business owner approvals, finance signoff, procurement gates, and vendor onboarding documents.",
      ["procurement", "intake", "approval_flow"],
      ["write_blackboard", "request_evidence"],
      0.69,
      40_000,
      0.91,
      "2026-04-24T12:00:00+01:00"
    ),
    agent(
      "agent-strategy",
      "VendorStrategy",
      "Strategic vendor fit analyst",
      "Compares vendor roadmap fit, build-versus-buy tradeoffs, team alignment, and future platform consolidation options.",
      ["vendor_strategy", "roadmap", "build_vs_buy"],
      ["read_public_web", "write_blackboard"],
      0.71,
      53_000,
      0.77,
      "2026-04-22T12:00:00+01:00"
    ),
    agent(
      "agent-ux",
      "AdoptionDesigner",
      "End-user adoption and workflow analyst",
      "Evaluates product usability, team onboarding friction, dashboard ergonomics, and internal enablement for analytics tools.",
      ["adoption", "enablement", "ux_review"],
      ["read_reviews", "write_blackboard"],
      0.68,
      49_000,
      0.82,
      "2026-04-19T12:00:00+01:00"
    )
  ];
}

export const TASK_PROMPT =
  "Evaluate PostHog as a new analytics vendor for a regulated B2B SaaS company. We need security review, pricing analysis, customer references, integration fit, and contract red flags. Give a buy, hold, or no-buy recommendation with source-backed evidence.";
