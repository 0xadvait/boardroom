import { resetDemoState } from "../lib/demo-store";
import { advanceDemo, ingestLiveSources, spawnBoardRoom } from "../lib/demo-engine";
import { applyMongoWrites, closeMongoClient, resetMongoDemo } from "../lib/mongo";

async function applyStep(label: string, state: ReturnType<typeof resetDemoState>) {
  if (label === "spawn") {
    const spawnResult = spawnBoardRoom(state);
    const ingestResult = await ingestLiveSources(spawnResult.state);
    await applyMongoWrites(ingestResult.state, [...spawnResult.writes, ...ingestResult.writes]);
    return ingestResult.state;
  }

  const result = advanceDemo(state);
  await applyMongoWrites(result.state, result.writes);
  return result.state;
}

async function main() {
  let state = resetDemoState();
  await resetMongoDemo(state);
  state = await applyStep("spawn", state);

  for (let index = 0; index < 7; index += 1) {
    state = await applyStep(`tick-${index + 1}`, state);
  }

  console.log(`Seeded demo run ${state.runId}`);
  console.log(`Status: ${state.status}`);
  console.log(`Mongo mode: ${state.mongo.mode}`);
  console.log(`Blackboard entries: ${state.blackboard.length}`);
  console.log(`Checkpoints: ${state.checkpoints.length}`);
  console.log(`Decision: ${state.finalDecision?.verdict ?? "pending"}`);
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    await closeMongoClient();
    console.error(error);
    process.exit(1);
  });
