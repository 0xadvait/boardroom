import { NextResponse } from "next/server";
import { ingestLiveSources, spawnBoardRoom } from "@/lib/demo-engine";
import { getDemoState, setDemoState } from "@/lib/demo-store";
import { applyMongoWrites } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST() {
  const spawnResult = spawnBoardRoom(getDemoState());
  const ingestResult = await ingestLiveSources(spawnResult.state);
  const writes = [...spawnResult.writes, ...ingestResult.writes];
  await applyMongoWrites(ingestResult.state, writes);
  setDemoState(ingestResult.state);
  return NextResponse.json(ingestResult.state);
}
