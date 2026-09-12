import { describe, expect, test } from "vitest";
import { createDb } from "../db/client";
import { seedCatalog } from "../db/seed";
import { sessions } from "../db/schema";
import {
  calculatePrice,
  checkAvailability,
  confirmBookingHold,
  createBookingHold,
  getRoomDetails,
  searchProperties,
} from "./inventory";

async function seededDb() {
  const db = createDb(":memory:");
  await seedCatalog(db);
  return db;
}

const now = "2026-09-12T08:00:00.000Z";

describe("searchProperties", () => {
  test("ranks the private villa first even when the guest only said private, not pool", async () => {
    const db = await seededDb();
    const { matches } = await searchProperties(db, {
      destination: "Goa",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      adults: 3,
      children: 0,
      privacy: "private",
      nowIso: now,
    });
    expect(matches[0]?.roomId).toBe("anjuna-pool-villa");
  });

  test("ranks the private pool villa first for Goa this weekend, 3 adults, private, under 20k", async () => {
    const db = await seededDb();
    const { matches } = await searchProperties(db, {
      destination: "Goa",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      adults: 3,
      children: 0,
      budgetPerNight: 20000,
      privacy: "private",
      amenityNeed: ["private_pool"],
      nowIso: now,
    });

    expect(matches[0]?.roomId).toBe("anjuna-pool-villa");
    expect(matches.some((room) => room.destination === "Alibaug")).toBe(false);
  });

  test("drops the sold-out villa for next weekend and still returns an alternative", async () => {
    const db = await seededDb();
    const { matches, rejected } = await searchProperties(db, {
      destination: "Goa",
      checkIn: "2026-09-18",
      checkOut: "2026-09-20",
      adults: 3,
      children: 0,
      budgetPerNight: 20000,
      privacy: "private",
      amenityNeed: ["private_pool"],
      nowIso: now,
    });

    expect(rejected.some((room) => room.roomId === "anjuna-pool-villa")).toBe(true);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.roomId).not.toBe("anjuna-pool-villa");
  });

  test("rejects a double room for five guests", async () => {
    const db = await seededDb();
    const { matches, rejected } = await searchProperties(db, {
      destination: "Goa",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      adults: 5,
      children: 0,
      nowIso: now,
    });

    expect(matches.some((room) => room.roomId === "palolem-double")).toBe(false);
    expect(
      rejected.find((room) => room.roomId === "palolem-double")?.rejectReason,
    ).toContain("capacity");
    expect(matches.some((room) => room.roomId === "palolem-family")).toBe(true);
  });
});

describe("calculatePrice", () => {
  test("uses nights, extra adults, and 12% tax — never model math", async () => {
    const db = await seededDb();
    const quote = await calculatePrice(db, {
      roomId: "anjuna-pool-villa",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      adults: 3,
      children: 0,
    });

    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.nights).toBe(2);
    expect(quote.roomSubtotal).toBe(37000);
    expect(quote.extraAdults).toBe(1);
    expect(quote.extraAdultTotal).toBe(5000);
    expect(quote.tax).toBe(5040);
    expect(quote.total).toBe(47040);
  });
});

describe("getRoomDetails", () => {
  test("marks heated_pool as unknown when the catalog has no such fact", async () => {
    const db = await seededDb();
    const details = await getRoomDetails(db, {
      roomId: "anjuna-pool-villa",
      askedFacts: ["heated_pool", "pool"],
    });

    expect(details.knownAmenities).toContain("pool");
    expect(details.unknownFacts).toEqual(["heated_pool"]);
  });
});

describe("createBookingHold", () => {
  test("blocks the room until the hold expires", async () => {
    const db = await seededDb();
    await db.insert(sessions).values({
      id: "sess-1",
      bookingState: "{}",
      updatedAt: now,
    });

    const hold = await createBookingHold(db, {
      sessionId: "sess-1",
      roomId: "anjuna-garden-suite",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      nowIso: now,
    });
    expect(hold.ok).toBe(true);

    const after = await checkAvailability(db, {
      roomId: "anjuna-garden-suite",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      nowIso: now,
    });
    expect(after.available).toBe(false);

    const expired = await checkAvailability(db, {
      roomId: "anjuna-garden-suite",
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      nowIso: "2026-09-12T08:16:00.000Z",
    });
    expect(expired.available).toBe(true);
  });

  test("the holding session still sees its own room as available", async () => {
    const db = await seededDb();
    await db.insert(sessions).values({
      id: "sess-1",
      bookingState: "{}",
      updatedAt: now,
    });

    const hold = await createBookingHold(db, {
      sessionId: "sess-1",
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
    });
    expect(hold.ok).toBe(true);

    const mine = await checkAvailability(db, {
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
      sessionId: "sess-1",
    });
    expect(mine.available).toBe(true);

    const other = await checkAvailability(db, {
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
      sessionId: "sess-2",
    });
    expect(other.available).toBe(false);
  });

  test("a second guest cannot take the last unit once the DB has decremented it", async () => {
    const db = await seededDb();
    await db.insert(sessions).values([
      { id: "sess-1", bookingState: "{}", updatedAt: now },
      { id: "sess-2", bookingState: "{}", updatedAt: now },
    ]);

    const first = await createBookingHold(db, {
      sessionId: "sess-1",
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
    });
    expect(first.ok).toBe(true);

    const second = await createBookingHold(db, {
      sessionId: "sess-2",
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
    });
    expect(second.ok).toBe(false);
  });

  test("confirming a hold does not free the room when the clock later passes the original TTL", async () => {
    const db = await seededDb();
    await db.insert(sessions).values({
      id: "sess-1",
      bookingState: "{}",
      updatedAt: now,
    });

    const hold = await createBookingHold(db, {
      sessionId: "sess-1",
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: now,
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;

    const confirmed = await confirmBookingHold(db, {
      holdId: hold.holdId,
      sessionId: "sess-1",
      nowIso: now,
    });
    expect(confirmed.ok).toBe(true);

    const later = await checkAvailability(db, {
      roomId: "palolem-studio",
      checkIn: "2026-09-19",
      checkOut: "2026-09-20",
      nowIso: "2026-09-12T08:16:00.000Z",
    });
    expect(later.available).toBe(false);
  });
});
