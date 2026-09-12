import { and, eq } from "drizzle-orm";
import type { MiraDb } from "../db/client";
import {
  addons,
  amenities,
  bookingHolds,
  inventory,
  policies,
  properties,
  rooms,
} from "../db/schema";
import { addNights, nightsBetween } from "./dates";

export type SearchQuery = {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  budgetPerNight?: number | null;
  privacy?: "private" | "any" | null;
  amenityNeed?: string[];
  nowIso: string;
  sessionId?: string;
};

export type RankedRoom = {
  propertyId: string;
  propertyName: string;
  destination: string;
  area: string;
  roomId: string;
  roomName: string;
  roomType: string;
  nightlyRate: number;
  maxGuests: number;
  isPrivate: boolean;
  amenities: string[];
  score: number;
  available: boolean;
  rejectReason?: string;
};

function stayDates(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: nights }, (_, index) => addNights(checkIn, index));
}

function destinationMatches(propertyDestination: string, query: string): boolean {
  const a = propertyDestination.trim().toLowerCase();
  const b = query.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export async function searchProperties(
  db: MiraDb,
  query: SearchQuery,
): Promise<{ matches: RankedRoom[]; rejected: RankedRoom[] }> {
  const roomRows = await db
    .select()
    .from(rooms)
    .innerJoin(properties, eq(rooms.propertyId, properties.id));
  const amenityRows = await db.select().from(amenities);
  const amenitiesByRoom = new Map<string, string[]>();
  for (const row of amenityRows) {
    const list = amenitiesByRoom.get(row.roomId) ?? [];
    list.push(row.name);
    amenitiesByRoom.set(row.roomId, list);
  }

  const guests = query.adults + query.children;
  const matches: RankedRoom[] = [];
  const rejected: RankedRoom[] = [];

  for (const row of roomRows) {
    const room = row.rooms;
    const property = row.properties;
    const roomAmenities = amenitiesByRoom.get(room.id) ?? [];
    const candidate: RankedRoom = {
      propertyId: property.id,
      propertyName: property.name,
      destination: property.destination,
      area: property.area,
      roomId: room.id,
      roomName: room.name,
      roomType: room.roomType,
      nightlyRate: room.nightlyRate,
      maxGuests: room.maxGuests,
      isPrivate: room.isPrivate === 1,
      amenities: roomAmenities,
      score: 0,
      available: false,
    };

    if (!destinationMatches(property.destination, query.destination)) {
      candidate.rejectReason = `destination is ${property.destination}, not ${query.destination}`;
      rejected.push(candidate);
      continue;
    }

    if (query.adults > room.maxAdults || guests > room.maxGuests) {
      candidate.rejectReason = `capacity ${room.maxGuests} (max ${room.maxAdults} adults); party is ${query.adults} adults and ${query.children} children`;
      rejected.push(candidate);
      continue;
    }

    if (query.budgetPerNight != null && room.nightlyRate > query.budgetPerNight) {
      candidate.rejectReason = `₹${room.nightlyRate}/night is above the ₹${query.budgetPerNight}/night budget`;
      rejected.push(candidate);
      continue;
    }

    const availability = await checkAvailability(db, {
      roomId: room.id,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      nowIso: query.nowIso,
      sessionId: query.sessionId,
    });
    candidate.available = availability.available;
    if (!availability.available) {
      candidate.rejectReason = availability.reason;
      rejected.push(candidate);
      continue;
    }

    let score = 40;
    if (query.privacy === "private" && candidate.isPrivate) score += 20;
    if (query.privacy === "private" && roomAmenities.includes("private_pool")) {
      score += 25;
    }
    if (query.privacy === "private" && room.roomType === "villa") score += 10;
    if (query.privacy === "private" && !candidate.isPrivate) score -= 10;
    for (const need of query.amenityNeed ?? []) {
      if (roomAmenities.includes(need)) score += 10;
    }
    candidate.score = score;
    matches.push(candidate);
  }

  matches.sort((a, b) => b.score - a.score || a.nightlyRate - b.nightlyRate);
  return { matches, rejected };
}

function holdIsBlocking(
  hold: { sessionId: string; status: string; expiresAt: string },
  nowIso: string,
  sessionId?: string,
): boolean {
  if (sessionId && hold.sessionId === sessionId) return false;
  if (hold.status === "released") return false;
  if (hold.status === "confirmed") return true;
  return hold.expiresAt > nowIso;
}

export async function checkAvailability(
  db: MiraDb,
  args: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    nowIso: string;
    sessionId?: string;
  },
): Promise<{ available: boolean; nights: Array<{ date: string; remaining: number }>; reason?: string }> {
  const dates = stayDates(args.checkIn, args.checkOut);
  if (dates.length === 0) {
    return { available: false, nights: [], reason: "checkout must be after check-in" };
  }

  const stock = await db
    .select()
    .from(inventory)
    .where(eq(inventory.roomId, args.roomId));
  const byDate = new Map(stock.map((row) => [row.date, row.available]));

  const holds = await db
    .select()
    .from(bookingHolds)
    .where(eq(bookingHolds.roomId, args.roomId));
  const activeHolds = holds.filter((hold) =>
    holdIsBlocking(hold, args.nowIso, args.sessionId),
  );

  const nights = dates.map((date) => {
    const base = byDate.get(date);
    if (base == null) {
      return { date, remaining: 0 };
    }
    const blocked = activeHolds.filter(
      (hold) => hold.checkIn <= date && date < hold.checkOut,
    ).length;
    return { date, remaining: Math.max(0, base - blocked) };
  });

  const soldOut = nights.filter((night) => night.remaining < 1);
  if (soldOut.length > 0) {
    return {
      available: false,
      nights,
      reason: `unavailable on ${soldOut.map((night) => night.date).join(", ")}`,
    };
  }
  return { available: true, nights };
}

export async function getRoomDetails(
  db: MiraDb,
  args: { roomId: string; askedFacts?: string[] },
): Promise<{
  found: boolean;
  room?: Record<string, unknown>;
  knownAmenities: string[];
  unknownFacts: string[];
}> {
  const [row] = await db
    .select()
    .from(rooms)
    .innerJoin(properties, eq(rooms.propertyId, properties.id))
    .where(eq(rooms.id, args.roomId))
    .limit(1);
  if (!row) return { found: false, knownAmenities: [], unknownFacts: args.askedFacts ?? [] };

  const knownAmenities = (
    await db.select().from(amenities).where(eq(amenities.roomId, args.roomId))
  ).map((item) => item.name);
  const known = new Set(knownAmenities);
  const unknownFacts = (args.askedFacts ?? []).filter((fact) => !known.has(fact));

  return {
    found: true,
    knownAmenities,
    unknownFacts,
    room: {
      id: row.rooms.id,
      name: row.rooms.name,
      propertyId: row.properties.id,
      propertyName: row.properties.name,
      destination: row.properties.destination,
      area: row.properties.area,
      roomType: row.rooms.roomType,
      nightlyRate: row.rooms.nightlyRate,
      extraAdultFee: row.rooms.extraAdultFee,
      includedGuests: row.rooms.includedGuests,
      maxAdults: row.rooms.maxAdults,
      maxChildren: row.rooms.maxChildren,
      maxGuests: row.rooms.maxGuests,
      isPrivate: row.rooms.isPrivate === 1,
      description: row.rooms.description,
    },
  };
}

export async function calculatePrice(
  db: MiraDb,
  args: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    addonIds?: string[];
  },
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      currency: "INR";
      nights: number;
      nightlyRate: number;
      roomSubtotal: number;
      extraAdults: number;
      extraAdultTotal: number;
      addons: Array<{ id: string; name: string; total: number }>;
      taxPercent: number;
      tax: number;
      total: number;
    }
> {
  const [row] = await db
    .select()
    .from(rooms)
    .innerJoin(properties, eq(rooms.propertyId, properties.id))
    .where(eq(rooms.id, args.roomId))
    .limit(1);
  if (!row) return { ok: false, error: `unknown room ${args.roomId}` };

  const nights = nightsBetween(args.checkIn, args.checkOut);
  if (nights < 1) return { ok: false, error: "checkout must be after check-in" };

  const extraAdults = Math.max(0, args.adults - row.rooms.includedGuests);
  const roomSubtotal = nights * row.rooms.nightlyRate;
  const extraAdultTotal = extraAdults * row.rooms.extraAdultFee * nights;

  const addonTotals: Array<{ id: string; name: string; total: number }> = [];
  for (const addonId of args.addonIds ?? []) {
    const [addon] = await db.select().from(addons).where(eq(addons.id, addonId)).limit(1);
    if (!addon) return { ok: false, error: `unknown add-on ${addonId}` };
    if (addon.propertyId !== row.rooms.propertyId) {
      return { ok: false, error: `add-on ${addonId} is not sold at this property` };
    }
    const guests = args.adults + args.children;
    let total = addon.priceInr;
    if (addon.priceType === "per_person_per_night") total = addon.priceInr * guests * nights;
    else if (addon.priceType === "per_night") total = addon.priceInr * nights;
    addonTotals.push({ id: addon.id, name: addon.name, total });
  }

  const addonSum = addonTotals.reduce((sum, item) => sum + item.total, 0);
  const taxable = roomSubtotal + extraAdultTotal + addonSum;
  const tax = Math.round((taxable * row.properties.taxPercent) / 100);
  return {
    ok: true,
    currency: "INR",
    nights,
    nightlyRate: row.rooms.nightlyRate,
    roomSubtotal,
    extraAdults,
    extraAdultTotal,
    addons: addonTotals,
    taxPercent: row.properties.taxPercent,
    tax,
    total: taxable + tax,
  };
}

export async function getPolicy(
  db: MiraDb,
  args: { propertyId: string; kind?: string },
): Promise<{ found: boolean; policies: Array<{ kind: string; body: string }> }> {
  const rows = args.kind
    ? await db
        .select()
        .from(policies)
        .where(and(eq(policies.propertyId, args.propertyId), eq(policies.kind, args.kind)))
    : await db.select().from(policies).where(eq(policies.propertyId, args.propertyId));
  return { found: rows.length > 0, policies: rows.map((row) => ({ kind: row.kind, body: row.body })) };
}

export async function getActiveHold(
  db: MiraDb,
  sessionId: string,
  nowIso: string,
): Promise<{
  id: string;
  sessionId: string;
  roomId: string;
  propertyId: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  expiresAt: string;
} | null> {
  const rows = await db
    .select()
    .from(bookingHolds)
    .where(eq(bookingHolds.sessionId, sessionId));
  const live = rows.filter((hold) => {
    if (hold.status === "released") return false;
    if (hold.status === "confirmed") return true;
    return hold.status === "held" && hold.expiresAt > nowIso;
  });
  live.sort((a, b) => {
    if (a.status === "held" && b.status !== "held") return -1;
    if (a.status !== "held" && b.status === "held") return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const hold = live[0];
  if (!hold) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, hold.roomId)).limit(1);
  return {
    id: hold.id,
    sessionId: hold.sessionId,
    roomId: hold.roomId,
    propertyId: room?.propertyId ?? null,
    checkIn: hold.checkIn,
    checkOut: hold.checkOut,
    status: hold.status,
    expiresAt: hold.expiresAt,
  };
}

export function applyActiveHold<T extends {
  bookingHoldId: string | null;
  selectedRoomId: string | null;
  selectedPropertyId: string | null;
  checkIn: string | null;
  checkOut: string | null;
}>(
  state: T,
  hold: Awaited<ReturnType<typeof getActiveHold>>,
): T {
  if (!hold) {
    return { ...state, bookingHoldId: null };
  }
  return {
    ...state,
    bookingHoldId: hold.id,
    selectedRoomId: hold.roomId,
    selectedPropertyId: hold.propertyId ?? state.selectedPropertyId,
    checkIn: state.checkIn ?? hold.checkIn,
    checkOut: state.checkOut ?? hold.checkOut,
  };
}

export async function createBookingHold(
  db: MiraDb,
  args: {
    sessionId: string;
    roomId: string;
    checkIn: string;
    checkOut: string;
    nowIso: string;
    ttlMinutes?: number;
  },
): Promise<{ ok: false; error: string } | { ok: true; holdId: string; expiresAt: string }> {
  const existing = await getActiveHold(db, args.sessionId, args.nowIso);
  if (
    existing &&
    existing.roomId === args.roomId &&
    existing.checkIn === args.checkIn &&
    existing.checkOut === args.checkOut
  ) {
    return { ok: true, holdId: existing.id, expiresAt: existing.expiresAt };
  }

  const availability = await checkAvailability(db, args);
  if (!availability.available) {
    return { ok: false, error: availability.reason ?? "unavailable" };
  }

  if (existing?.status === "held") {
    await db
      .update(bookingHolds)
      .set({ status: "released" })
      .where(eq(bookingHolds.id, existing.id));
  }

  const ttl = args.ttlMinutes ?? 15;
  const expires = new Date(args.nowIso);
  expires.setUTCMinutes(expires.getUTCMinutes() + ttl);
  const holdId = `hold_${crypto.randomUUID()}`;
  await db.insert(bookingHolds).values({
    id: holdId,
    sessionId: args.sessionId,
    roomId: args.roomId,
    checkIn: args.checkIn,
    checkOut: args.checkOut,
    expiresAt: expires.toISOString(),
    createdAt: args.nowIso,
    status: "held",
  });
  return { ok: true, holdId, expiresAt: expires.toISOString() };
}

export async function confirmBookingHold(
  db: MiraDb,
  args: { holdId: string; sessionId: string; nowIso: string },
): Promise<
  | { ok: false; error: string }
  | { ok: true; holdId: string; roomId: string; checkIn: string; checkOut: string; status: "confirmed" }
> {
  const [row] = await db
    .select()
    .from(bookingHolds)
    .where(eq(bookingHolds.id, args.holdId))
    .limit(1);
  if (!row || row.sessionId !== args.sessionId) {
    return { ok: false, error: "hold not found for this guest session" };
  }
  if (row.status === "released") {
    return { ok: false, error: "that hold was released" };
  }
  if (row.status === "held" && row.expiresAt <= args.nowIso) {
    return { ok: false, error: "that hold expired" };
  }
  if (row.status !== "confirmed") {
    await db
      .update(bookingHolds)
      .set({ status: "confirmed" })
      .where(eq(bookingHolds.id, args.holdId));
  }
  return {
    ok: true,
    holdId: row.id,
    roomId: row.roomId,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    status: "confirmed",
  };
}

export async function listAddons(db: MiraDb, propertyId: string) {
  return db.select().from(addons).where(eq(addons.propertyId, propertyId));
}

export { stayDates };
