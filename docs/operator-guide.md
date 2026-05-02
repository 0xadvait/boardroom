# Team Manager MCP Operator Guide

Team Manager is meant to run inside any MCP-capable agent client. There is no dashboard and no scenario-specific script: the host agent calls Team Manager tools to plan, supervise, checkpoint, and audit a specialist room.

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
        "BRIGHTDATA_API_TOKEN": "<optional_for_search_and_scrape>",
        "TEAM_MANAGER_LOGIC_MODEL": "gpt-5.5",
        "TEAM_MANAGER_LOGIC_REASONING_EFFORT": "xhigh",
        "TEAM_MANAGER_AESTHETIC_MODEL": "claude-opus-4-7"
      }
    }
  }
}
```

The server logs governance events to stderr while keeping stdout protocol-clean for MCP JSON-RPC.

## Host Contract

Team Manager is the control plane, not the worker runtime. The host agent is responsible for actually running the specialists it chooses to run. Team Manager provides the durable state and governance APIs:

- inspect local provider configuration and save preferences with `team_manager_onboard`
- register available workers with `team_manager_register_agents`
- propose and approve the room with `team_manager_plan_room` and `team_manager_approve_plan`
- start the room with `team_manager_start_room`
- register or ingest sources only when the task needs evidence
- let workers call `team_manager_query_context`, `team_manager_post_blackboard`, `team_manager_write_memory`, `team_manager_record_checkpoint`, and `team_manager_update_budget`
- store the outcome with `team_manager_emit_result`

## Example Prompts

Use any complex task that benefits from multiple specialists:

```text
Build a premium website and slide deck for our MongoDB-native multi-agent orchestration MCP. Use Team Manager to classify the task, propose the agent room, ask me before starting, allocate token budgets, keep memory scoped, checkpoint each specialist, and return an audited deliverable summary.
```

```text
Build trading agents for a crypto strategy with market-data ingestion, backtesting, execution controls, risk limits, and operator override paths.
```

```text
I want to evaluate whether my company should get listed on Coinbase as an exchange or not. Use Team Manager to classify the task, propose the agent room, ask me before starting, use sources I provide, manage the group token budget, checkpoint each specialist, and return an audited recommendation.
```

## Usual Tool Sequence

1. `team_manager_onboard` to inspect configured providers and persist preferences.
2. Optional: `team_manager_register_agents` with the host's actual worker inventory.
3. `team_manager_plan_room`.
4. Ask the user the manager's returned approval questions.
5. `team_manager_approve_plan`.
6. `team_manager_start_room`.
7. If the task needs external evidence, call `team_manager_find_sources` or host-native search plus `team_manager_set_sources`, then `team_manager_ingest_sources`.
8. Run workers and have them use `team_manager_query_context`, `team_manager_post_blackboard`, `team_manager_write_memory`, `team_manager_record_checkpoint`, and `team_manager_update_budget`.
9. Use `team_manager_kill_agent` and `team_manager_resume_agent` if a worker is interrupted.
10. `team_manager_emit_result`.
11. `team_manager_state` with `includeFullAudit=true`.

`team_manager_kill_agent` and `team_manager_resume_agent` are checkpoint controls: they record host-side worker failure and return resume context. They do not pretend to kill an OS process.

## What To Inspect

While operating the MCP, inspect MongoDB and the tool outputs for:

- the manager's questions before execution
- classified task type and selected specialists from the broader capability pool
- routing cascade and weighted capability formula
- task-estimated per-agent token caps, budget formula inputs, and group threshold actions
- Bright Data search/scrape or host-native source registration when evidence is needed
- blackboard entries and scoped memory cards
- checkpoint write, host-side interruption record, and resume context
- final audited result linking claims or deliverables to blackboard entries, sources, or artifacts

## One-Line Description

Team Manager is a MongoDB-native MCP control plane for multi-agent collaboration: it asks the user how to run the team, initializes specialists, allocates token budgets, sets shared-memory boundaries, checkpoints workers, and uses MongoDB as durable collaboration state.
