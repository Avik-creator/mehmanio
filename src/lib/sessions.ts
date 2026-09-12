import { eq, sql } from "drizzle-orm";
import type { MiraDb } from "../db/client";
import { messages, sessions } from "../db/schema";
import { nowIso } from "./clock";
import { emptyBookingState } from "./state";
import type { BookingState } from "./types";

export async function loadState(db: MiraDb, sessionId: string): Promise<BookingState> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!row) {
    const state = emptyBookingState();
    await db.insert(sessions).values({
      id: sessionId,
      bookingState: JSON.stringify(state),
      updatedAt: nowIso(),
    });
    return state;
  }
  return JSON.parse(row.bookingState) as BookingState;
}

export async function saveState(
  db: MiraDb,
  sessionId: string,
  state: BookingState,
): Promise<void> {
  const payload = JSON.stringify(state);
  const updatedAt = nowIso();
  const [existing] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (existing) {
    await db
      .update(sessions)
      .set({ bookingState: payload, updatedAt })
      .where(eq(sessions.id, sessionId));
    return;
  }
  await db.insert(sessions).values({
    id: sessionId,
    bookingState: payload,
    updatedAt,
  });
}

export async function appendMessage(
  db: MiraDb,
  sessionId: string,
  role: "guest" | "mira",
  content: string,
): Promise<void> {
  await db.insert(messages).values({
    id: crypto.randomUUID(),
    sessionId,
    role,
    content,
    createdAt: nowIso(),
  });
}

export async function loadMessages(
  db: MiraDb,
  sessionId: string,
): Promise<Array<{ id: string; role: "guest" | "mira"; content: string; createdAt: string }>> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(sql`rowid`);
  return rows.map((row) => ({
    id: row.id,
    role: row.role as "guest" | "mira",
    content: row.content,
    createdAt: row.createdAt,
  }));
}
