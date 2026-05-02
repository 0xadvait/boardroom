# Team Manager MCP

MongoDB-native team manager for multi-agent collaboration.

**Tagline:** Tell it the job. It proposes the team, budgets, memory rules, and models. Approve the plan, then kill any agent and watch it resume from MongoDB.

Team Manager is an MCP server for governing arbitrary multi-agent work. An MCP-capable host gives it any complex request, the manager classifies the task, proposes a specialist room, asks the human for approval or edits, and MongoDB Atlas stores the skills, assignments, shared context, memory boundaries, token budget, checkpoints, source evidence, and audit trail.

## Primary Theme

Team Manager is built for **Multi-Agent Collaboration**:

- **Agents convey skills:** `agent_profiles` stores declared skills plus proven performance history.
- **Agents identify peers:** capability scoring ranks 12 candidates and proposes the best 5-agent room.
- **Agents share context:** `blackboard_entries` is the shared room context, with vector relevance and change-stream style subscription events.
- **Agents stay inside token limits:** `tasks` and `groups` hold the group budget, warning threshold, summarizer threshold, and hard-stop action.
- **Agents retain scoped memory:** `memory_cards` stores private, team, and global memory with filtered retrieval.
- **Agents survive interruptions:** `agent_performance_records` stores checkpoints and resume tokens.

It also touches prolonged coordination through checkpoint/resume and adaptive retrieval through source, memory, and blackboard relevance, but the submission story should lead with multi-agent collaboration.

## MCP Flow

The intended MCP sequence is collaborative:

1. `team_manager_plan_room`: proposes the measurement formula, routing cascade, specialist roster, versioned capability vectors, token allocation, model profiles, memory visibility, priorities, and user questions.
2. `team_manager_approve_plan`: records the human's approval or revision request in MongoDB.
3. `team_manager_set_sources`: registers the URLs the host agent or user wants the room to use.
4. `team_manager_start_room`: dispatches the approved room and asks for sources if none have been registered.
5. `team_manager_ingest_sources`: fetches registered URLs, extracts generic evidence snippets from the task query, and writes `source_documents`.
6. `team_manager_post_blackboard`: lets host-run specialist agents publish source-linked findings to shared context.
7. `team_manager_query_context`: retrieves relevant blackboard, memory, and source evidence with visibility filtering.
8. `team_manager_write_memory`: stores private, team, or global memory cards.
9. `team_manager_record_checkpoint`: persists agent checkpoints.
10. `team_manager_kill_agent`: records that the MCP host killed or lost a worker and stores the checkpoint state.
11. `team_manager_resume_agent`: returns checkpoint context for the host to restart that worker.
12. `team_manager_update_budget`: updates group token usage and returns threshold actions.
13. `team_manager_emit_decision`: stores the final decision and claim-to-evidence audit trail.

## Design Anchors

These papers influenced the implementation, but the demo should stay product-led rather than citation-led:

- [Federation of Agents](https://arxiv.org/abs/2509.20175): selected agents expose a versioned capability vector with declared skills, proven performance, cost, and constraints.
- [MasRouter](https://arxiv.org/abs/2502.11133): `team_manager_plan_room` returns a cascaded routing plan: collaboration mode, candidate retrieval, capability scoring, role allocation, model assignment, budget assignment, and memory boundary.
- [LLM-Based Multi-Agent Blackboard System](https://arxiv.org/abs/2510.01285): shared work happens through append-only `blackboard_entries` plus explicit context queries.
- [Collaborative Memory](https://arxiv.org/abs/2505.18279): `team_manager_query_context` enforces private/team/global memory visibility before returning context.
- [MCP for Multi-Agent Systems](https://arxiv.org/abs/2504.21030): the product is an MCP control plane, not a dashboard.

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

## Atlas Sandbox

Create `.env.local` locally from `.env.example` and set:

```bash
MONGODB_URI="mongodb+srv://advait:<URL_ENCODED_PASSWORD>@cluster0.1hulng.mongodb.net/?appName=Cluster0"
TEAM_MANAGER_DB=team_manager
```

Initialize collections and indexes:

```bash
npm run atlas:init
```

Validate the filtered vector index on `memory_cards`:

```bash
npm run atlas:smoke
```

## MongoDB Collections

- `governance_plans`: proposed and approved room plans, questions, model profiles, token allocations, and memory policy.
- `agent_profiles`: candidate agent cards, skills, embeddings, and learned performance stats.
- `agent_performance_records`: time-series execution records and checkpoints.
- `tasks`: active work item, group assignment, token budget, and current status.
- `groups`: room membership and group-level token consumption.
- `blackboard_entries`: shared findings, decisions, requests, progress, and warnings.
- `memory_cards`: private, team, and global scoped memory cards.
- `source_documents`: live public source pages and extracted evidence snippets.
- `audit`: append-only event and claim trail.

Atlas Vector Search indexes:

- `agent_profiles.agent_description_vector_index`
- `blackboard_entries.blackboard_content_vector_index`
- `memory_cards.memory_layered_vector_index`

## Submission Summary

**Project:** Team Manager MCP

**One-liner:** A MongoDB-native MCP team manager that helps a user plan, budget, dispatch, coordinate, and audit specialist agents.

**Live demo:** run `npm run mcp` from an MCP client and ask any complex question that benefits from specialist coordination.

**MongoDB use:** Atlas organizes and oversees the collaboration: agent skills, room plan, task assignment, shared blackboard, scoped memory, group budget, checkpoints, source evidence, and audit.

**Pitch line:** This is not a vertical chatbot or a dashboard. It is the MongoDB-native team manager that turns a vague task into an approved multi-agent room with explicit skills, budgets, priorities, memory boundaries, shared context, and recoverable execution.
