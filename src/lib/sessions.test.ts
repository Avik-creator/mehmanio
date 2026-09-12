import { expect, test } from "vitest";
import { createDb } from "../db/client";
import { seedCatalog } from "../db/seed";
import { applyActiveHold, createBookingHold, getActiveHold } from "./inventory";
import { appendMessage, loadMessages, loadState, saveState } from "./sessions";
import { emptyBookingState } from "./state";

const now = "2026-09-12T08:00:00.000Z";

test("a session id restores the thread and the live hold after a simulated refresh", async () => {
  const db = createDb(":memory:");
  await seedCatalog(db);
  const sessionId = "guest-refresh";
  await saveState(db, sessionId, {
    ...emptyBookingState(),
    destination: "Goa",
    adults: 3,
    checkIn: "2026-09-19",
    checkOut: "2026-09-20",
  });
  const hold = await createBookingHold(db, {
    sessionId,
    roomId: "palolem-studio",
    checkIn: "2026-09-19",
    checkOut: "2026-09-20",
    nowIso: now,
  });
  expect(hold.ok).toBe(true);
  if (!hold.ok) return;

  await appendMessage(db, sessionId, "guest", "Palm Studio");
  await appendMessage(db, sessionId, "mira", "Held for 15 minutes.");

  const stored = await loadState(db, sessionId);
  const liveHold = await getActiveHold(db, sessionId, now);
  const restored = applyActiveHold(stored, liveHold);
  const thread = await loadMessages(db, sessionId);

  expect(liveHold?.id).toBe(hold.holdId);
  expect(restored.bookingHoldId).toBe(hold.holdId);
  expect(restored.selectedRoomId).toBe("palolem-studio");
  expect(thread.map((row) => row.role)).toEqual(["guest", "mira"]);
  expect(thread.map((row) => row.content)).toEqual([
    "Palm Studio",
    "Held for 15 minutes.",
  ]);
});
