# Team Manager MCP Demo Guide

Team Manager is meant to be shown from an MCP-capable agent client. There is no dashboard and no scenario-specific script.

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
        "TEAM_MANAGER_DB": "team_manager",
        "BRIGHTDATA_API_TOKEN": "<optional_for_team_manager_find_sources>"
      }
    }
  }
}
```

The server logs governance events to stderr while keeping stdout protocol-clean for MCP JSON-RPC.
If Bright Data is not configured inside Team Manager, use the MCP host's native search and call `team_manager_set_sources` with URLs plus optional `extractedText`.

## Judge Prompt

Use any complex prompt that benefits from multiple specialists. For example:

```text
I want to evaluate whether my company should get listed on Coinbase as an exchange or not. Use Team Manager to classify the task, propose the agent room, ask me before starting, use sources I provide, keep private memory private, manage the group token budget, and return an audited recommendation.
```

Expected tool sequence:

1. `team_manager_plan_room`
2. The MCP host asks the user the manager's returned questions. The returned plan includes task type, routing cascade, versioned capability vectors, execution profiles, budget math, and per-agent token caps.
3. `team_manager_approve_plan`
4. `team_manager_find_sources` if Bright Data MCP is configured, otherwise host-native search followed by `team_manager_set_sources`
5. `team_manager_start_room`
6. `team_manager_ingest_sources`
7. Host-run specialist agents use `team_manager_query_context`, `team_manager_post_blackboard`, `team_manager_write_memory`, `team_manager_record_checkpoint`, and `team_manager_update_budget`
8. `team_manager_kill_agent` and `team_manager_resume_agent` if the host kills or loses a worker mid-run
9. `team_manager_emit_decision`
10. `team_manager_state` with `includeFullAudit=true`

`team_manager_kill_agent` and `team_manager_resume_agent` are checkpoint controls: they record host-side worker failure and return resume context. They do not pretend to kill an OS process.

## What To Show

Show the MCP host calling the manager tools and MongoDB receiving the room state:

- the Team Manager's questions before execution
- classified task type and selected specialists from the broader capability pool
- routing cascade and weighted capability formula
- task-estimated per-agent token caps, budget formula inputs, and group threshold actions
- Bright Data search/scrape or host-native source registration and source ingestion into `source_documents`
- blackboard entries and scoped memory cards
- checkpoint write, host-side interruption record, and resume context
- final audited decision linking claims to blackboard entries and sources

## What To Say

Team Manager is a MongoDB-native control plane for multi-agent collaboration. The user can ask any complex question. MongoDB Atlas organizes and oversees the room: skills in `agent_profiles`, assignments in `tasks` and `groups`, shared context in `blackboard_entries`, scoped memory in `memory_cards`, checkpoints in `agent_performance_records`, source evidence in `source_documents`, and final traceability in `audit`.

Lead with the hackathon theme:

> "This is our answer to Multi-Agent Collaboration: a Team Manager MCP server that asks the user how to run the team, initializes the right specialists, allocates token budgets, sets shared-memory boundaries, and uses MongoDB as the durable collaboration state."

Do not present it as a vertical chatbot or a dashboard.
