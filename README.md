<p align="center">
  <h1 align="center">Team Manager MCP</h1>
  <p align="center"><strong>A MongoDB-native control plane for arbitrary multi-agent work.</strong></p>
  <p align="center">
    <img alt="MCP server" src="https://img.shields.io/badge/MCP-server-111827">
    <img alt="MongoDB Atlas" src="https://img.shields.io/badge/MongoDB-Atlas-13AA52">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6">
    <img alt="MCP native" src="https://img.shields.io/badge/UI-MCP%20native-7C3AED">
  </p>
</p>

---

**Tell it the job. It proposes the team, budgets, models, memory rules, source policy, and checkpoints. Approve the plan, then let your MCP host run specialists with MongoDB as the durable room state.**

Team Manager is an MCP server that turns a vague request into a governed specialist room. It is not a dashboard, not a vertical chatbot, and not a scripted demo. The MCP host runs the actual worker agents; Team Manager plans, coordinates, budgets, persists, and audits the collaboration.

```text
User request
  -> Team Manager classifies the task
  -> proposes specialists, budgets, models, memory boundaries
  -> human approves or edits
  -> MCP host runs workers
  -> MongoDB stores shared context, checkpoints, budget, and audit
```

## Contents

- [Why It Exists](#why-it-exists)
- [Features](#features)
- [Hackathon Fit](#hackathon-fit)
- [Example Requests](#example-requests)
- [Architecture](#architecture)
- [MCP Tools](#mcp-tools)
- [MongoDB Collections](#mongodb-collections)
- [Quick Start](#quick-start)
- [What Is Real](#what-is-real)

## Why It Exists

Multi-agent workflows usually fail in the boring places:

- Agents are selected from prompts, not observed performance.
- Shared context becomes either isolated silos or noisy group chat.
- Memory has no real boundary between private, team, and global knowledge.
- Token use grows without a group-level budget or recovery plan.
- A killed worker loses state unless the orchestration layer writes checkpoints.

Team Manager gives the host agent a MongoDB-backed control plane for those problems.

## Features

- **Task-aware team formation:** classifies arbitrary requests and selects specialists from a capability pool.
- **Capability vectors:** every selected agent exposes declared skills, capabilities, observed performance, token efficiency, and constraints.
- **Human-approved room plans:** the manager asks concrete approval questions before dispatching work.
- **MongoDB blackboard:** specialists publish findings, requests, progress, warnings, and decisions into a shared collection.
- **Scoped memory:** memory is `private`, `team`, or `global`; private cards only return to their owner agent.
- **Source-linked evidence:** the host registers arbitrary URLs, Team Manager extracts query-relevant evidence, and final claims cite source ids.
- **Group token governance:** one room budget with 70% warning, 90% summarizer action, and 100% configured hard action.
- **Checkpoint recovery:** host-side worker interruption is recorded in MongoDB and resumed from checkpoint context.
- **Audit trail:** final decisions link claim -> blackboard entry -> source document.

## Hackathon Fit

Built for the **MongoDB Agentic Evolution Hackathon** theme **Multi-Agent Collaboration**.

| Theme question | Team Manager answer |
|---|---|
| How do agents convey their skills? | `agent_profiles` stores declared skills, capability vectors, embeddings, and observed performance. |
| How does the system identify suitable peers? | `team_manager_plan_room` classifies the request, scores candidates, and proposes a specialist room. |
| How do agents share context within token limits? | `blackboard_entries`, `memory_cards`, `source_documents`, and top-k context retrieval keep shared context explicit and bounded. |
| How is collaboration organized and overseen? | `governance_plans`, `tasks`, `groups`, budget thresholds, checkpoints, and `audit` make MongoDB the room state. |

It also touches **Prolonged Coordination** through checkpoint/resume and **Adaptive Retrieval** through source, memory, and blackboard relevance.

## What It Does

Given any complex request, for example:

```text
I want to evaluate whether my company should get listed on Coinbase as an exchange or not.
```

Team Manager:

1. Classifies the task, for example `crypto_market_decision`, `technical_decision`, `market_strategy`, `legal_risk`, `financial_analysis`, or `general_decision`.
2. Scores a pool of specialist agents using capability relevance, history, recency, latency, and token efficiency.
3. Proposes a human-approved room plan: specialists, models, token caps, memory visibility, routing stages, and open questions.
4. Registers arbitrary sources selected by the host or user.
5. Stores source evidence, blackboard entries, memory cards, checkpoints, budget state, and decisions in MongoDB.
6. Returns filtered context to each specialist according to visibility boundaries.
7. Records worker interruption and returns checkpoint context for the host to resume that worker.
8. Emits a final audited decision where claims link back to blackboard entries and source evidence.

## Example Requests

Team Manager is designed for open-ended work that benefits from several specialists. Example requests:

```text
Evaluate whether my company should get listed on Coinbase as an exchange.
```

```text
Should we migrate our billing system from a monolith to event-driven services?
```

```text
Plan the fastest credible market-entry strategy for a new B2B product in the UK.
```

The MCP host can add operational requirements to the prompt, such as: ask for approval before starting, use only user-provided sources, keep private memory private, manage a group token budget, checkpoint each specialist, and return an audited recommendation.

## Current Specialist Pool

The room is selected dynamically from a general-purpose pool:

| Agent | Specialty |
|---|---|
| `EvidenceScout` | Primary research, source triage, fact extraction |
| `TechnicalFit` | Architecture, APIs, integration, implementation risk |
| `MarketMapper` | Market structure, customers, competitors, ecosystem |
| `LegalRisk` | Legal, compliance, policy, contract, approval gates |
| `FinanceModeler` | Cost, ROI, revenue, budget, commercial tradeoffs |
| `CryptoMarket` | Exchange listings, liquidity, custody, token and market structure |
| `OpsPlanner` | Execution plan, dependencies, owners, rollout risk |
| `RiskRegister` | Cross-functional risk aggregation and mitigations |
| `ImplementationPM` | Stakeholders, sequencing, migration, change management |
| `UserImpact` | User, customer, and workflow impact |
| `StrategyLead` | Options, tradeoffs, second-order effects, priorities |
| `SynthesisCritic` | Contradictions, evidence quality, final recommendation |

The selected room depends on the prompt. A Coinbase listing prompt should pull in `CryptoMarket`; a billing architecture prompt should pull in `TechnicalFit`.

## Architecture

```text
MCP host
  |
  | calls Team Manager tools
  v
Team Manager MCP
  |
  | plans, scores, budgets, filters, checkpoints, audits
  v
MongoDB Atlas
  |-- agent_profiles
  |-- governance_plans
  |-- tasks / groups
  |-- blackboard_entries
  |-- memory_cards
  |-- source_documents
  |-- agent_performance_records
  `-- audit
```

MongoDB is not just storage here. It is the collaboration substrate: routing data, room state, shared context, scoped memory, token budget, checkpoint recovery, and decision provenance all live in Atlas.

## MCP Tools

| Tool | Purpose |
|---|---|
| `team_manager_plan_room` | Propose task type, routing cascade, specialists, capability vectors, token caps, model profiles, memory policy, and approval questions. |
| `team_manager_approve_plan` | Record human approval or revision request. |
| `team_manager_set_sources` | Register arbitrary URLs chosen by the host or user. |
| `team_manager_start_room` | Dispatch the approved room. If no sources exist, asks for sources instead of fabricating evidence. |
| `team_manager_ingest_sources` | Fetch registered URLs, extract generic query-relevant evidence snippets, and write `source_documents`. |
| `team_manager_query_context` | Retrieve relevant blackboard, source, and memory context with visibility filters. |
| `team_manager_post_blackboard` | Append findings, decisions, requests, progress, or warnings to shared room context. |
| `team_manager_write_memory` | Store private, team, or global memory cards. |
| `team_manager_record_checkpoint` | Persist agent progress and pending tool calls. |
| `team_manager_update_budget` | Update group token usage and return threshold actions. |
| `team_manager_kill_agent` | Record host-side worker interruption and preserve checkpoint state. |
| `team_manager_resume_agent` | Return checkpoint context for the restarted worker. |
| `team_manager_emit_decision` | Store final verdict, votes, rationale, and claim-to-evidence trail. |
| `team_manager_state` | Read current room state, blackboard entries, checkpoints, and audit records. |
| `team_manager_reset` | Reset local room state and clear scoped MongoDB documents. |

Typical sequence:

```text
plan_room -> approve_plan -> set_sources -> start_room -> ingest_sources
  -> specialists query/post/write/checkpoint/update_budget
  -> emit_decision -> state
```

## Governance Layers

| Layer | Implementation |
|---|---|
| Capability profiling | Declared skills plus proven task history, token efficiency, latency, and recency. |
| Shared blackboard | Append-only `blackboard_entries` with source links, visibility, embeddings, reactions, and promotion state. |
| Layered memory | `memory_cards` use `private`, `team`, and `global` visibility. Private memory requires owner-agent match. |
| Token budget governance | Group budget in `tasks` and `groups`; warnings at 70%, summarizer action at 90%, configured action at 100%. |
| Checkpoint/resume | `agent_performance_records` stores step index, partial output, pending tool calls, and resume token. |
| Auditability | Final claims in `audit` link back to blackboard entries and source ids. |

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `agent_profiles` | Candidate agent cards, skills, embeddings, capabilities, and performance stats. |
| `governance_plans` | Proposed and approved room plans, questions, routing stages, model profiles, budgets, and memory policy. |
| `tasks` | Active work item, assigned agents, task type, budget, checkpoint, and status. |
| `groups` | Room membership and group-level token budget. |
| `blackboard_entries` | Shared findings, decisions, requests, progress, and warnings. |
| `memory_cards` | Private, team, and global memory with filtered retrieval. |
| `source_documents` | User-provided public sources plus extracted evidence snippets. |
| `agent_performance_records` | Time-series execution records and recovery checkpoints. |
| `audit` | Append-only timeline and final claim-to-evidence trail. |

Atlas Vector Search indexes:

- `agent_profiles.agent_description_vector_index`
- `blackboard_entries.blackboard_content_vector_index`
- `memory_cards.memory_layered_vector_index`

## Quick Start

```bash
npm install
npm run mcp
```

For MCP client configs, call the server directly so stdout stays JSON-RPC clean:

```bash
./node_modules/.bin/tsx scripts/mcp-server.ts
```

Example MCP config:

```json
{
  "mcpServers": {
    "team-manager": {
      "command": "/Users/advaitjayant/hackathon/team-manager/node_modules/.bin/tsx",
      "args": ["/Users/advaitjayant/hackathon/team-manager/scripts/mcp-server.ts"],
      "env": {
        "MONGODB_URI": "mongodb+srv://advait:<URL_ENCODED_PASSWORD>@cluster0.1hulng.mongodb.net/?appName=Cluster0",
        "TEAM_MANAGER_DB": "team_manager"
      }
    }
  }
}
```

Full demo operator notes are in [docs/mcp-demo.md](docs/mcp-demo.md).

## Atlas Setup

Set the Atlas Sandbox connection string:

```bash
export MONGODB_URI="mongodb+srv://advait:<URL_ENCODED_PASSWORD>@cluster0.1hulng.mongodb.net/?appName=Cluster0"
export TEAM_MANAGER_DB=team_manager
```

Initialize collections and indexes:

```bash
npm run atlas:init
```

Validate filtered vector retrieval on `memory_cards`:

```bash
npm run atlas:smoke
```

Validate TypeScript:

```bash
npm run build
```

## Design Anchors

The README is product-led, but the implementation is grounded in current multi-agent systems work:

- [Federation of Agents](https://arxiv.org/abs/2509.20175): versioned capability vectors and semantic routing.
- [MasRouter](https://arxiv.org/abs/2502.11133): cascaded routing over collaboration mode, roles, and model choices.
- [LLM-Based Multi-Agent Blackboard System](https://arxiv.org/abs/2510.01285): shared blackboard for discovery and coordination.
- [Collaborative Memory](https://arxiv.org/abs/2505.18279): dynamic access control for shared memory.
- [MCP for Multi-Agent Systems](https://arxiv.org/abs/2504.21030): MCP as the context-sharing interface for multi-agent coordination.

## What Is Real

Implemented:

- MCP server with generic tools.
- Dynamic task classification.
- Capability-based room planning.
- Generic source registration and ingestion.
- Shared blackboard writes.
- Visibility-aware memory retrieval.
- Group token budget threshold actions.
- Agent checkpoint, interruption, and resume records.
- Final audited decision writes.
- MongoDB collection and index setup.

Boundary:

- Team Manager does not secretly launch five LLM subprocesses itself. The MCP host runs the workers and calls Team Manager tools. Team Manager is the governance/control plane.
- The source extractor is intentionally generic. It extracts query-relevant snippets from user-provided URLs; it is not a domain-specific scraper.

## Pitch Line

Team Manager MCP is the MongoDB-native control plane that turns any complex request into an approved specialist room with explicit skills, token budgets, memory boundaries, shared context, checkpoints, and an auditable final decision.
