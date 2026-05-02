import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  advanceDemo,
  ingestLiveSources,
  killContractAgent,
  restartContractAgent,
  spawnBoardRoom
} from "../lib/demo-engine";
import { getDemoState, resetDemoState, setDemoState } from "../lib/demo-store";
import { applyMongoWrites, closeMongoClient, resetMongoDemo } from "../lib/mongo";
import type { DemoState, MongoWrite } from "../lib/types";

function logEvent(event: string, fields: Record<string, unknown> = {}) {
  const rendered = Object.entries(fields)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  console.error(`[boardroom] ${event}${rendered ? ` ${rendered}` : ""}`);
}

function compactState(state: DemoState) {
  return {
    runId: state.runId,
    taskId: state.taskId,
    status: state.status,
    mongo: state.mongo,
    vendor: state.vendor,
    selectedAgents: state.selectedAgents
      .filter((agent) => agent.agentId !== "agent-summarizer")
      .map((agent) => ({
        agentId: agent.agentId,
        name: agent.name,
        status: agent.status,
        score: agent.score,
        currentStep: agent.currentStep
      })),
    sources: state.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      status: source.status,
      contentLength: source.contentLength ?? 0,
      evidenceCount: source.evidence?.length ?? 0
    })),
    budget: state.budget,
    blackboardEntries: state.blackboard.length,
    checkpoints: state.checkpoints.length,
    subscriptions: state.subscriptions.length,
    decision: state.finalDecision
  };
}

function toolJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

async function applyAndStore(state: DemoState, writes: MongoWrite[]) {
  await applyMongoWrites(state, writes);
  setDemoState(state);
  return state;
}

const server = new McpServer({
  name: "boardroom",
  version: "0.1.0"
});

server.registerTool(
  "boardroom_start_room",
  {
    title: "Start Governed Agent Room",
    description:
      "Reset the current BoardRoom run, configure governance, dispatch the specialist pool, fetch live evidence, and persist room state to MongoDB Atlas.",
    inputSchema: {
      request: z
        .string()
        .default("I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way.")
        .describe("The user's high-level work request."),
      vendor: z.string().default("PostHog").describe("Vendor or target entity for the live workload."),
      tokenBudget: z.number().int().positive().default(50_000).describe("Group token budget for the governed run."),
      reset: z.boolean().default(true).describe("Reset the current room before starting.")
    }
  },
  async ({ request, vendor, tokenBudget, reset }) => {
    let state = reset ? resetDemoState() : getDemoState();
    if (reset) {
      await resetMongoDemo(state);
    }

    state.vendor = vendor;
    state.taskPrompt = request;
    state.budget.total = tokenBudget;
    logEvent("room.configure", {
      vendor,
      tokenBudget,
      memoryVisibility: ["private", "team", "global"],
      budgetThresholds: ["70% warning", "90% summarizer", "100% abort"]
    });
    logEvent("dispatch.formula", {
      prompt: 0.25,
      history: 0.35,
      recency: 0.1,
      time: 0.15,
      tokenEfficiency: 0.15
    });

    const spawnResult = spawnBoardRoom(state);
    const ingestResult = await ingestLiveSources(spawnResult.state);
    state = await applyAndStore(ingestResult.state, [...spawnResult.writes, ...ingestResult.writes]);
    logEvent("dispatch.selected", {
      agents: state.selectedAgents
        .filter((agent) => agent.agentId !== "agent-summarizer")
        .map((agent) => ({
          name: agent.name,
          rank: agent.score?.rank,
          score: agent.score?.matchScore,
          tokenEfficiency: agent.score?.tokenEfficiency
        }))
    });
    logEvent("sources.ingested", {
      collection: "source_documents",
      fetched: state.sources.filter((source) => source.status === "fetched").length,
      evidenceSnippets: state.sources.reduce((sum, source) => sum + (source.evidence?.length ?? 0), 0)
    });

    return toolJson({
      message: "BoardRoom started. Agents dispatched and live evidence fetched.",
      governance: {
        tokenBudget,
        memoryVisibility: ["private", "team", "global"],
        dispatchWeights: {
          prompt: 0.25,
          historicalSuccess: 0.35,
          recency: 0.1,
          timeEfficiency: 0.15,
          tokenEfficiency: 0.15
        }
      },
      state: compactState(state)
    });
  }
);

server.registerTool(
  "boardroom_advance",
  {
    title: "Advance Governance Step",
    description:
      "Advance the governed workflow by one step: blackboard findings, subscriptions, budget cascade, checkpoint recovery, and final decision.",
    inputSchema: {}
  },
  async () => {
    const current = getDemoState();
    if (current.selectedAgents.length === 0) {
      const spawnResult = spawnBoardRoom(current);
      const ingestResult = await ingestLiveSources(spawnResult.state);
      const state = await applyAndStore(ingestResult.state, [...spawnResult.writes, ...ingestResult.writes]);
      return toolJson({
        message: "Room was empty, so BoardRoom started the room instead.",
        state: compactState(state)
      });
    }

    const result = advanceDemo(current);
    const state = await applyAndStore(result.state, result.writes);
    logEvent("room.advance", {
      status: state.status,
      budget: `${state.budget.consumed}/${state.budget.total}`,
      warnedAt70: state.budget.warnedAt70,
      summarizedAt90: state.budget.summarizedAt90,
      blackboardEntries: state.blackboard.length,
      checkpoints: state.checkpoints.length,
      latestAgent: state.checkpoints[0]?.agentName
    });

    return toolJson({
      message: "Advanced one governance step.",
      state: compactState(state),
      latestBlackboardEntry: state.blackboard[0] ?? null,
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "boardroom_kill_agent",
  {
    title: "Kill Contract Agent",
    description: "Simulate killing the ContractRedFlags agent after its latest checkpoint has been persisted.",
    inputSchema: {}
  },
  async () => {
    const result = killContractAgent(getDemoState());
    const state = await applyAndStore(result.state, result.writes);
    logEvent("agent.kill", {
      agent: "ContractRedFlags",
      checkpoint: state.checkpoints[0]?.mongoChangeStreamResumeToken,
      partialOutput: state.checkpoints[0]?.partialOutput
    });
    return toolJson({
      message: "ContractRedFlags killed after checkpoint write.",
      state: compactState(state),
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "boardroom_resume_agent",
  {
    title: "Resume Contract Agent",
    description: "Resume ContractRedFlags from the latest MongoDB checkpoint.",
    inputSchema: {}
  },
  async () => {
    const result = restartContractAgent(getDemoState());
    const state = await applyAndStore(result.state, result.writes);
    logEvent("agent.resume", {
      agent: "ContractRedFlags",
      checkpoint: state.checkpoints[0]?.mongoChangeStreamResumeToken,
      status: state.status
    });
    return toolJson({
      message: "ContractRedFlags resumed from MongoDB checkpoint.",
      state: compactState(state),
      latestCheckpoint: state.checkpoints[0] ?? null
    });
  }
);

server.registerTool(
  "boardroom_state",
  {
    title: "Read BoardRoom State",
    description: "Read the current governed room state, including selected agents, source evidence, budget, checkpoints, and decision.",
    inputSchema: {
      includeFullAudit: z.boolean().default(false)
    }
  },
  async ({ includeFullAudit }) => {
    const state = getDemoState();
    return toolJson({
      state: compactState(state),
      blackboard: state.blackboard,
      audit: includeFullAudit ? state.audit : state.audit.slice(0, 5),
      checkpoints: includeFullAudit ? state.checkpoints : state.checkpoints.slice(0, 5)
    });
  }
);

server.registerTool(
  "boardroom_reset",
  {
    title: "Reset BoardRoom",
    description: "Reset the room to a clean state and clear this run's MongoDB demo documents.",
    inputSchema: {}
  },
  async () => {
    const state = resetDemoState();
    await resetMongoDemo(state);
    setDemoState(state);
    logEvent("room.reset", {
      mongo: state.mongo.mode,
      db: state.mongo.dbName
    });
    return toolJson({
      message: "BoardRoom reset.",
      state: compactState(state)
    });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  transport.onclose = async () => {
    await closeMongoClient();
  };
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await closeMongoClient();
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeMongoClient();
  await server.close();
  process.exit(0);
});

main().catch(async (error) => {
  await closeMongoClient();
  console.error(error);
  process.exit(1);
});
