# BoardRoom

MongoDB-native MCP control plane for governed multi-agent workflows.

**Tagline:** Five agents. One budget. One blackboard. Kill any of them live and watch them resume.

BoardRoom is an MCP control plane. It exposes governance tools that any MCP-capable agent client can call while MongoDB Atlas stores the room state, evidence, blackboard, memory, checkpoints, budget, and audit trail.

BoardRoom demonstrates four primitives for production multi-agent systems:

- Capability profiling: dispatch uses declared skills plus proven MongoDB performance history.
- Shared blackboard: specialist agents publish source-backed findings and peers auto-subscribe.
- Layered memory: private, team, and global memory cards with filtered Atlas Vector Search.
- Token-budget governance: group-level budget warning at 70%, summarizer spawn at 90%, configured action at 100%.

The live workflow evaluates PostHog as an analytics vendor for a regulated B2B SaaS buyer. BoardRoom fetches public vendor pages during the run, stores extracted evidence in MongoDB, and governs a specialist agent room through MCP tools.

## Hackathon Alignment

BoardRoom is built for the MongoDB Agentic Evolution themes:

- **Prolonged Coordination:** every agent step writes a checkpoint to MongoDB, and the demo kills and resumes `ContractRedFlags` mid-task from persisted state.
- **Multi-Agent Collaboration:** 12 MongoDB-backed agent profiles are ranked into 5 specialists; agents publish findings to a shared blackboard and subscribe to relevant peer discoveries.
- **Adaptive Retrieval:** blackboard and memory retrieval use vector similarity plus visibility filters so agents receive source-backed context that changes with the task and their authorization.

What was built during the hackathon: the MCP governance server, MongoDB collections/index scripts, terminal harness, demo state machine, token cascade, layered memory, blackboard, and checkpoint/resume path.

## Quick Start

```bash
npm install
npm run mcp
```

For MCP client configs, call the server directly so stdout stays protocol-clean:

```bash
./node_modules/.bin/tsx scripts/mcp-server.ts
```

Example MCP server entry:

```json
{
  "mcpServers": {
    "boardroom": {
      "command": "/Users/advaitjayant/hackathon/team-manager/node_modules/.bin/tsx",
      "args": ["/Users/advaitjayant/hackathon/team-manager/scripts/mcp-server.ts"],
      "env": {
        "MONGODB_URI": "mongodb+srv://advait:<URL_ENCODED_PASSWORD>@cluster0.1hulng.mongodb.net/?appName=Cluster0",
        "BOARDROOM_DB": "boardroom"
      }
    }
  }
}
```

Available MCP tools:

- `boardroom_start_room`
- `boardroom_advance`
- `boardroom_kill_agent`
- `boardroom_resume_agent`
- `boardroom_state`
- `boardroom_reset`

Terminal demo harness:

```bash
npm run harness -- "I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way."
```

Full demo operator notes are in [docs/mcp-demo.md](docs/mcp-demo.md).

## Atlas Sandbox

Create `.env.local` locally from `.env.example` and set:

```bash
MONGODB_URI="mongodb+srv://advait:<URL_ENCODED_PASSWORD>@cluster0.1hulng.mongodb.net/?appName=Cluster0"
BOARDROOM_DB=boardroom
```

The app never needs credentials committed to git.

Initialize collections and indexes:

```bash
npm run atlas:init
```

Validate the filtered vector index on `memory_cards`:

```bash
npm run atlas:smoke
```

Seed a full replay into Atlas:

```bash
npm run seed
```

## Demo Run

Use an MCP client or the included terminal harness. The recommended live script:

```bash
npm run harness -- "I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way."
```

The harness prints the governance events that an MCP client would trigger:

1. Configure the room: group token budget, memory visibility, threshold actions.
2. Dispatch the specialist board using capability profile scoring.
3. Fetch live public vendor sources into MongoDB `source_documents`.
4. Advance blackboard findings and vector subscriptions.
5. Trigger 70% warning and 90% summarizer.
6. Kill and resume `ContractRedFlags` from MongoDB checkpoint.
7. Emit a source-linked governed output.

The terminal trace deliberately shows the control-plane internals: candidate scores, context policy, source ingestion, blackboard entries, memory visibility, budget bars, checkpoints, and audit edges.

## Submission Summary

**Project:** BoardRoom

**One-liner:** MongoDB governance for multi-agent workflows: capability dispatch, shared blackboard, layered memory, token budgets, and checkpoint recovery.

**Live demo:** run `npm run mcp` from an MCP client, or use `npm run harness -- "<request>"` for the terminal walkthrough.

**MongoDB use:** Atlas stores the agent registry, active tasks, group budget, blackboard, layered memory cards, checkpoints, and audit log. Atlas Vector Search powers capability matching and filtered memory retrieval.

**Why it matters:** teams are moving from single agents to fleets of agents, but most demos have no durable coordination, access-controlled shared memory, or budget enforcement. BoardRoom shows that governance layer working live.

## MongoDB Collections

- `agent_profiles`
- `agent_performance_records`
- `tasks`
- `blackboard_entries`
- `memory_cards`
- `groups`
- `audit`
- `source_documents`

Atlas Vector Search indexes:

- `agent_profiles.agent_description_vector_index`
- `blackboard_entries.blackboard_content_vector_index`
- `memory_cards.memory_layered_vector_index`

## Demo Evidence

The demo fetches these public source URLs live and stores extracted snippets in MongoDB before agents write findings:

- PostHog Trust Center: `https://trust.posthog.com/`
- PostHog Pricing: `https://posthog.com/pricing`
- PostHog Product OS: `https://posthog.com/`

## Pitch Line

BoardRoom is not a vendor-selection chatbot or a dashboard. It is the MCP governance plane underneath real multi-agent work: capability dispatch, shared MongoDB blackboard, access-controlled memory retrieval, budget enforcement, checkpointed recovery, and source-linked auditability.
