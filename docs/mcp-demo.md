# Team Manager MCP Demo Guide

Team Manager is meant to be shown from an MCP-capable agent client or from the included terminal harness. There is no dashboard in the demo path.

## MCP Client Config

Use a stdio MCP server config like this, replacing the path and MongoDB URI with your local values:

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

The server logs governance events to stderr while keeping stdout protocol-clean for MCP JSON-RPC.

## Judge Prompt

Use this prompt in Claude Code, Claude Desktop, Hermes, Codex, or any MCP host wired to the Team Manager server:

```text
I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way. Use Team Manager to propose the agent room, ask me for approval on measurement weights, token budgets, memory rules, and model choices, then run the approved multi-agent workflow with MongoDB-backed shared context and audit.
```

Expected tool sequence:

1. `team_manager_plan_room`
2. The MCP host asks the user the manager's returned questions. The returned plan includes the routing cascade, versioned capability vectors, model choices, and per-agent token caps.
3. `team_manager_approve_plan`
4. `team_manager_set_sources`
5. `team_manager_start_room`
6. `team_manager_ingest_sources`
7. Host-run specialist agents use `team_manager_query_context`, `team_manager_post_blackboard`, `team_manager_write_memory`, `team_manager_record_checkpoint`, and `team_manager_update_budget`
8. `team_manager_emit_decision`
9. `team_manager_state` with `includeFullAudit=true`

The older `team_manager_advance`, `team_manager_kill_agent`, and `team_manager_resume_agent` tools are the rehearsed PostHog replay path. Use them only when you want the 60-second scripted demo beat.

## Terminal Harness

If an MCP host is slow or unavailable, run the exact same governance path directly:

```bash
npm run harness -- "I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way."
```

The harness prints:

- the Team Manager's proposed questions
- agent fit measurement parameters
- model profiles and temperature settings
- per-agent token caps
- MongoDB-backed memory and context policies
- capability dispatch from 12 candidates to 5 specialists
- live source ingestion into `source_documents`
- blackboard writes and auto-subscriptions
- memory promotion and summarizer context compression
- checkpoint write, kill, and resume
- final audit links from claim to blackboard entry to source document

The harness is a replayable demo trace. The real MCP product surface is the generic tool set above: source registration, source ingestion, blackboard posting, scoped memory, checkpointing, budget governance, and audited decisions.

## Arbitrary Task Demo

For a non-PostHog prompt, do not use the replay tools. Use the generic MCP tools:

```text
I want to evaluate whether my company should get listed on Coinbase as an exchange or not. Use Team Manager to plan the agent room, ask me before starting, use sources I provide, keep private memory private, and return an audited decision.
```

The host should then call:

1. `team_manager_plan_room` with the Coinbase-listing request.
2. `team_manager_approve_plan` after user approval or edits.
3. `team_manager_set_sources` with live URLs selected by the host or user.
4. `team_manager_start_room`.
5. `team_manager_ingest_sources`.
6. The host-run specialists call the context, blackboard, memory, checkpoint, and budget tools while doing the work.

If no custom sources are registered, `team_manager_start_room` deliberately refuses to ingest the PostHog source pack. That is the guardrail that prevents the generic MCP workflow from pretending a scripted vendor demo is live evidence for another task.

## What To Say

Team Manager is a MongoDB-native control plane for multi-agent collaboration. The vendor evaluation is just a legible workload for the judges. MongoDB Atlas organizes and oversees the room: skills in `agent_profiles`, assignments in `tasks` and `groups`, shared context in `blackboard_entries`, scoped memory in `memory_cards`, checkpoints in `agent_performance_records`, and source-linked claims in `audit`.

Lead with the hackathon theme:

> "This is our answer to Multi-Agent Collaboration: a Team Manager MCP server that asks the user how to run the team, initializes the right specialists, allocates token budgets, sets shared-memory boundaries, and uses MongoDB as the durable collaboration state."

Do not present it as a vendor-selection chatbot or a dashboard.
