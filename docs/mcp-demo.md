# BoardRoom MCP Demo Guide

BoardRoom is meant to be shown from an MCP-capable agent client or from the included terminal harness. There is no dashboard in the demo path.

## MCP Client Config

Use a stdio MCP server config like this, replacing the path and MongoDB URI with your local values:

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

The server logs governance events to stderr while keeping stdout protocol-clean for MCP JSON-RPC.

## Judge Prompt

Use this prompt in Claude Code, Claude Desktop, Hermes, Codex, or any MCP host wired to the BoardRoom server:

```text
I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way. Use BoardRoom to govern the agent room, keep token spend under control, and show me the final audited recommendation.
```

Expected tool sequence:

1. `boardroom_start_room`
2. `boardroom_advance` until the 70 percent budget warning appears
3. `boardroom_advance` again to trigger the 90 percent summarizer
4. `boardroom_kill_agent`
5. `boardroom_resume_agent`
6. `boardroom_advance` for the final decision
7. `boardroom_state` with `includeFullAudit=true`

## Terminal Harness

If an MCP host is slow or unavailable, run the exact same governance path directly:

```bash
npm run harness -- "I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way."
```

The harness prints:

- room configuration: group budget, memory visibility, and threshold actions
- capability dispatch: 12 candidates ranked into 5 specialists
- live source ingestion: public vendor pages stored in `source_documents`
- blackboard writes and auto-subscriptions
- memory promotion and summarizer context compression
- checkpoint write, kill, and resume
- final audit links from claim to blackboard entry to source document

## What To Say

BoardRoom is the governance plane under multi-agent work. The vendor evaluation is just a legible workload for the judges. MongoDB Atlas is the durable coordination layer: profiles, source documents, blackboard, memory, budget state, checkpoints, and audit.

Do not present it as a vendor-selection chatbot or a dashboard. Present it as an MCP server that any agent harness can use to make multi-agent work auditable, budgeted, recoverable, and source-linked.
