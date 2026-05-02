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

**Tell it the job. It proposes the team, task-estimated token budgets, execution profiles, memory rules, source policy, and checkpoints. Approve the plan, then let your MCP host run specialists with MongoDB as the durable room state.**

Team Manager is an MCP server that turns a vague request into a governed specialist room. It is not a dashboard, not a vertical chatbot, and not a scripted demo. The MCP host runs the actual worker agents; Team Manager plans, coordinates, budgets, persists, and audits the collaboration.

```text
User request
  -> Team Manager classifies the task
  -> proposes specialists, budgets, execution profiles, memory boundaries
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
- [Budget Math](#budget-math)
- [Evidence Retrieval](#evidence-retrieval)
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
- **Source-linked evidence:** Team Manager can search through Bright Data MCP, ingest user or host-provided URLs, accept extracted text from native host search, and cite source ids.
- **Task-estimated token governance:** one room budget estimated from the request and selected agents, with 70% warning, 90% summarizer action, and 100% configured hard action.
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
3. Proposes a human-approved room plan: specialists, execution profiles, task-estimated token caps, memory visibility, routing stages, and open questions.
4. Finds or registers arbitrary sources selected by the host or user.
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

## Budget Math

Team Manager does not use a fixed demo budget. `team_manager_plan_room` estimates the group budget from the actual task and selected room, then stores the full `budgetEstimate` object in `governance_plans`.

### Group Budget

```text
request_tokens ~= ceil(word_count(request) * 1.35)

task_complexity =
  (1 + min(2.2, request_tokens / 160) + 0.14 * risk_signal_count)
  * task_type_multiplier

coordination_overhead =
  (selected_agent_count + 1) * request_tokens * 16

estimated_group_budget =
  clamp(22_000, 120_000,
    round_to_1k(
      sum(selected_agent_historical_tokens) * task_complexity
      + coordination_overhead
    )
  )
```

The task type multiplier is intentionally modest. It is a planning prior, not a fake scenario script:

| Task type | Multiplier |
|---|---:|
| `crypto_market_decision` | `1.30` |
| `legal_risk` | `1.25` |
| `technical_decision` | `1.18` |
| `procurement_decision` | `1.12` |
| `financial_analysis` | `1.12` |
| `market_strategy` | `1.10` |
| `general_decision` | `1.00` |

Risk signals are generic terms such as `regulatory`, `legal`, `compliance`, `security`, `financial`, `audit`, `sources`, `checkpoint`, `private`, `exchange`, and `listing`. They increase budget because the room needs more evidence, review, and audit work.

### Per-Agent Split

After reserving budget for the manager and summarizer, the remaining budget is split by each agent's expected work demand:

```text
reserve_ratio =
  18% if task_complexity >= 2.2
  16% if task_complexity >= 1.7
  14% otherwise

allocatable_budget = group_budget * (1 - reserve_ratio)

agent_demand =
  historical_tokens_for_this_or_general_task
  * priority_multiplier
  * cold_start_multiplier
  * capability_score_multiplier

priority_multiplier =
  1.22 for critical roles
  1.08 for high-priority roles
  1.00 for medium roles

cold_start_multiplier =
  1.12 when this agent has fewer than 3 runs for this task type
  1.00 otherwise

capability_score_multiplier =
  0.85 + 0.35 * agent_match_score

agent_token_cap =
  round_to_100(
    allocatable_budget * agent_demand / sum(all_agent_demands)
  )
```

This makes the split explainable: high-demand specialists get more budget, critical reviewers get a risk premium, cold-start agents get a small uncertainty buffer, and strong capability matches get slightly more room because they are likely to do useful work.

### Worked Example

For:

```text
I want to evaluate whether my company should get listed on Coinbase as an exchange or not.
```

the current planner classifies the request as `crypto_market_decision`, selects `EvidenceScout`, `FinanceModeler`, `LegalRisk`, `CryptoMarket`, and `TechnicalFit`, then produces a task-estimated group budget around `68,000` tokens:

| Input | Value |
|---|---:|
| Request token estimate | `23` |
| Task complexity score | `1.669` |
| Selected agents' historical tokens | `39,292` |
| Coordination overhead | `2,208` |
| Group reserve | `9,520` |
| Final group budget | `68,000` |

Per-agent caps are then allocated from demand:

| Agent | Historical tokens | Priority | Demand score | Token cap |
|---|---:|---|---:|---:|
| `EvidenceScout` | `7,727` | high | `10,598` | `11,300` |
| `FinanceModeler` | `7,816` | high | `10,693` | `11,400` |
| `LegalRisk` | `7,640` | critical | `11,807` | `12,500` |
| `CryptoMarket` | `8,718` | high | `11,876` | `12,600` |
| `TechnicalFit` | `7,391` | high | `10,068` | `10,700` |

If the host passes an explicit `tokenBudget`, Team Manager records `budgetEstimate.mode = "manual_override"` and still recomputes the per-agent split from demand. Otherwise the budget is task-estimated.

## Evidence Retrieval

Team Manager supports three evidence paths, all ending in the same MongoDB `source_documents` collection:

| Path | When used | How it works |
|---|---|---|
| Bright Data MCP search/scrape | `BRIGHTDATA_API_TOKEN` is configured | `team_manager_find_sources` discovers sources; `team_manager_ingest_sources` scrapes markdown through Bright Data when native fetch is thin. |
| Host-native search | Claude/Codex/Hermes already found good sources | The host calls `team_manager_set_sources` with URLs and optional `extractedText`; Team Manager stores and chunks that text. |
| Native fetch fallback | No extractor is configured or a page is simple HTML | Team Manager fetches the URL directly, strips HTML, and extracts query-relevant snippets. |

This keeps the demo honest: if a page is JS-rendered, bot-protected, or a binary PDF, Team Manager either uses Bright Data, accepts host-extracted text, or records the extraction weakness instead of fabricating evidence.

## MCP Tools

| Tool | Purpose |
|---|---|
| `team_manager_plan_room` | Propose task type, routing cascade, specialists, capability vectors, task-estimated token caps, execution profiles, memory policy, and approval questions. |
| `team_manager_approve_plan` | Record human approval or revision request. |
| `team_manager_find_sources` | Use Bright Data MCP search to discover source URLs and optionally register them. |
| `team_manager_set_sources` | Register arbitrary URLs chosen by the host or user. |
| `team_manager_start_room` | Dispatch the approved room. If no sources exist, asks for sources instead of fabricating evidence. |
| `team_manager_ingest_sources` | Extract source evidence through `auto`, `brightdata`, or `native` mode and write `source_documents`. |
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
plan_room -> approve_plan -> find_sources or set_sources -> start_room -> ingest_sources
  -> specialists query/post/write/checkpoint/update_budget
  -> emit_decision -> state
```

## Governance Layers

| Layer | Implementation |
|---|---|
| Capability profiling | Declared skills plus proven task history, token efficiency, latency, and recency. |
| Shared blackboard | Append-only `blackboard_entries` with source links, visibility, embeddings, reactions, and promotion state. |
| Layered memory | `memory_cards` use `private`, `team`, and `global` visibility. Private memory requires owner-agent match. |
| Token budget governance | Task-estimated group budget in `tasks` and `groups`; warnings at 70%, summarizer action at 90%, configured action at 100%. |
| Checkpoint/resume | `agent_performance_records` stores step index, partial output, pending tool calls, and resume token. |
| Auditability | Final claims in `audit` link back to blackboard entries and source ids. |

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `agent_profiles` | Candidate agent cards, skills, embeddings, capabilities, and performance stats. |
| `governance_plans` | Proposed and approved room plans, questions, routing stages, execution profiles, budget estimates, and memory policy. |
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
        "TEAM_MANAGER_DB": "team_manager",
        "BRIGHTDATA_API_TOKEN": "<optional_for_search_and_scrape>",
        "TEAM_MANAGER_MANAGER_MODEL": "<optional_real_model_id>",
        "TEAM_MANAGER_SPECIALIST_MODEL": "<optional_real_model_id>",
        "TEAM_MANAGER_REVIEW_MODEL": "<optional_real_model_id>",
        "TEAM_MANAGER_SUMMARIZER_MODEL": "<optional_real_model_id>"
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
export BRIGHTDATA_API_TOKEN="<optional>"
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
- Task-estimated group budgets and per-agent budget allocation with the formula stored in MongoDB.
- Execution profile assignment without fake hard-coded model ids; real model ids can be supplied through env config.
- Bright Data MCP search/scrape integration with native fetch and host-extracted text fallback.
- Generic source registration and ingestion.
- Shared blackboard writes.
- Visibility-aware memory retrieval.
- Group token budget threshold actions.
- Agent checkpoint, interruption, and resume records.
- Final audited decision writes.
- MongoDB collection and index setup.

Boundary:

- Team Manager does not secretly launch five LLM subprocesses itself. The MCP host runs the workers and calls Team Manager tools. Team Manager is the governance/control plane.
- The source extractor is intentionally generic. It extracts query-relevant snippets from searched or user-provided URLs; it is not a domain-specific scraper.

## Pitch Line

Team Manager MCP is the MongoDB-native control plane that turns any complex request into an approved specialist room with explicit skills, token budgets, memory boundaries, shared context, checkpoints, and an auditable final decision.
