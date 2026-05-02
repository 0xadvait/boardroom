import { NextResponse } from "next/server";
import { restartContractAgent } from "@/lib/demo-engine";
import { getDemoState, setDemoState } from "@/lib/demo-store";
import { applyMongoWrites } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = restartContractAgent(getDemoState());
  await applyMongoWrites(result.state, result.writes);
  setDemoState(result.state);
  return NextResponse.json(result.state);
}
