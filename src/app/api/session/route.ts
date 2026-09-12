import { readyDb } from "@/db/ready";
import { nowIso, todayIso } from "@/lib/clock";
import { applyActiveHold, getActiveHold } from "@/lib/inventory";
import { loadMessages, loadState, saveState } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const db = await readyDb();
  const stored = await loadState(db, sessionId);
  const hold = await getActiveHold(db, sessionId, nowIso());
  const state = applyActiveHold(stored, hold);
  if (state.bookingHoldId !== stored.bookingHoldId) {
    await saveState(db, sessionId, state);
  }
  const messages = await loadMessages(db, sessionId);

  return Response.json(
    {
      sessionId,
      today: todayIso(),
      state,
      hold,
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        text: row.content,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
