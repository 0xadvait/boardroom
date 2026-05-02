import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const voiceSchema = z.object({
  text: z.string().min(1).max(300)
});

export async function POST(request: Request) {
  const parsed = voiceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice request" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  if (!apiKey) {
    return NextResponse.json({ fallback: "browser_speech" });
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: parsed.data.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8
      }
    })
  });

  if (!response.ok || !response.body) {
    return NextResponse.json({ fallback: "browser_speech" });
  }

  return new Response(response.body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store"
    }
  });
}
