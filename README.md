# BoardRoom

MongoDB-native governance for multi-agent vendor evaluation.

**Tagline:** Five agents. One budget. One blackboard. Kill any of them live and watch them resume.

BoardRoom demonstrates four primitives for production multi-agent systems:

- Capability profiling: dispatch uses declared skills plus proven MongoDB performance history.
- Shared blackboard: specialist agents publish source-backed findings and peers auto-subscribe.
- Layered memory: private, team, and global memory cards with filtered Atlas Vector Search.
- Token-budget governance: group-level budget warning at 70%, summarizer spawn at 90%, configured action at 100%.

The live workflow evaluates PostHog as an analytics vendor for a regulated B2B SaaS buyer. The app is a Next.js dashboard with MongoDB driver API routes. It runs in fallback replay mode without credentials and switches to Atlas mode when `MONGODB_URI` is available.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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

Use the dashboard controls:

1. `Spawn`: ranks 12 agents and selects the top 5 by the weighted dispatch formula.
2. `Advance`: steps through blackboard posts, vector subscription, 70% warning, 90% summarizer, kill, resume, and decision.
3. `60s Run`: plays the whole judge-facing sequence.
4. `Kill` and `Restart`: manually trigger the ContractRedFlags checkpoint-resume beat.

## MongoDB Collections

- `agent_profiles`
- `agent_performance_records`
- `tasks`
- `blackboard_entries`
- `memory_cards`
- `groups`
- `audit`

Atlas Vector Search indexes:

- `agent_profiles.agent_description_vector_index`
- `blackboard_entries.blackboard_content_vector_index`
- `memory_cards.memory_layered_vector_index`

## Evidence Sources

The demo uses public source URLs for the visible vendor-evaluation claims:

- PostHog Trust Center: `https://trust.posthog.com/`
- PostHog Pricing: `https://posthog.com/pricing`
- PostHog Product OS: `https://posthog.com/`
- PostHog open-source notes: `https://posthog.com/blog/the-hidden-benefits-of-being-an-open-source-startup`

## ElevenLabs

Set `ELEVENLABS_API_KEY` and optionally `ELEVENLABS_VOICE_ID` in `.env.local`. Without it, the browser speech API narrates the same budget-cascade events.

## Pitch Line

BoardRoom is not a vendor-selection chatbot. It is the governance plane underneath real multi-agent work: capability dispatch, shared MongoDB blackboard, access-controlled memory retrieval, budget enforcement, checkpointed recovery, and source-linked auditability.
