import { NextResponse } from "next/server";
import { advanceDemo, ingestLiveSources, spawnBoardRoom } from "@/lib/demo-engine";
import { getDemoState, setDemoState } from "@/lib/demo-store";
import { applyMongoWrites } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST() {
  const current = getDemoState();
  if (current.selectedAgents.length === 0) {
    const spawnResult = spawnBoardRoom(current);
    const ingestResult = await ingestLiveSources(spawnResult.state);
    const writes = [...spawnResult.writes, ...ingestResult.writes];
    await applyMongoWrites(ingestResult.state, writes);
    setDemoState(ingestResult.state);
    return NextResponse.json(ingestResult.state);
  }

  const result = advanceDemo(current);
  await applyMongoWrites(result.state, result.writes);
  setDemoState(result.state);
  return NextResponse.json(result.state);
}
