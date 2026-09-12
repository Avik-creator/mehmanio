import { readyDb } from "@/db/ready";
import { emptyBookingState } from "@/lib/state";
import { saveState } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }
  const db = await readyDb();
  const state = emptyBookingState();
  await saveState(db, sessionId, state);
  return Response.json({ ok: true, state });
}
