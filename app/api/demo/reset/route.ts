import { NextResponse } from "next/server";
import { resetDemoState, setDemoState } from "@/lib/demo-store";
import { resetMongoDemo } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = resetDemoState();
  await resetMongoDemo(state);
  setDemoState(state);
  return NextResponse.json(state);
}
