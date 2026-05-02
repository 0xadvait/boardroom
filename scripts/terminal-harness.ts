import { advanceDemo, ingestLiveSources, spawnBoardRoom } from "../lib/demo-engine";
import { resetDemoState } from "../lib/demo-store";
import { applyMongoWrites, closeMongoClient, resetMongoDemo } from "../lib/mongo";
import type { DemoState, MongoWrite } from "../lib/types";

const request =
  process.argv.slice(2).join(" ") ||
  "I want to due diligence PostHog as a vendor for my B2B SaaS business in the most efficient way.";

function line(label: string, text: string) {
  console.log(`${label.padEnd(18)} ${text}`);
}

async function apply(state: DemoState, writes: MongoWrite[]) {
  await applyMongoWrites(state, writes);
  return state;
}

async function main() {
  let state = resetDemoState();
  state.taskPrompt = request;
  await resetMongoDemo(state);

  console.log("\nBoardRoom MCP Harness");
  console.log("=====================");
  line("request", request);
  line("governance", "budget=50,000 tokens; memory=private/team/global; action@100%=abort");
  line("dispatch", "0.25 prompt + 0.35 history + 0.10 recency + 0.15 latency + 0.15 token-efficiency");

  const spawn = spawnBoardRoom(state);
  const ingest = await ingestLiveSources(spawn.state);
  state = await apply(ingest.state, [...spawn.writes, ...ingest.writes]);
  line("selected", state.selectedAgents.filter((agent) => agent.agentId !== "agent-summarizer").map((agent) => `${agent.name}#${agent.score?.rank}`).join(", "));
  line("sources", `${state.sources.filter((source) => source.status === "fetched").length}/3 fetched, ${state.sources.reduce((sum, source) => sum + (source.evidence?.length ?? 0), 0)} snippets -> MongoDB source_documents`);

  for (let step = 1; step <= 4; step += 1) {
    const result = advanceDemo(state);
    state = await apply(result.state, result.writes);
    line(`advance ${step}`, `status=${state.status}; budget=${state.budget.consumed}/${state.budget.total}; blackboard=${state.blackboard.length}; checkpoints=${state.checkpoints.length}`);
  }

  let result = advanceDemo(state);
  state = await apply(result.state, result.writes);
  line("kill", `${state.checkpoints[0]?.agentName} checkpoint=${state.checkpoints[0]?.mongoChangeStreamResumeToken}`);

  result = advanceDemo(state);
  state = await apply(result.state, result.writes);
  line("resume", `${state.checkpoints[0]?.agentName} checkpoint=${state.checkpoints[0]?.mongoChangeStreamResumeToken}`);

  result = advanceDemo(state);
  state = await apply(result.state, result.writes);
  line("decision", `${state.finalDecision?.verdict} confidence=${state.finalDecision?.confidence}`);
  line("audit", `${state.audit.length} claims linked to blackboard entries and public sources`);
  console.log("");
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    await closeMongoClient();
    console.error(error);
    process.exit(1);
  });
