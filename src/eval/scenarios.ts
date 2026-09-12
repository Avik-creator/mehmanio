import { createDb } from "../db/client";
import { seedCatalog } from "../db/seed";
import { fallbackExtract, extractedToPatch } from "../lib/agent/extract";
import { todayIso } from "../lib/clock";
import { calculatePrice, getRoomDetails, searchProperties } from "../lib/inventory";
import { applyRecovery, nextActionAfterMerge } from "../lib/recovery";
import { applySlotPatch, emptyBookingState } from "../lib/state";
import type { BookingState } from "../lib/types";

export type Scenario = {
  id: string;
  title: string;
  turns: string[];
  expect: {
    destination?: string;
    adults?: number;
    children?: number;
    checkIn?: string;
    checkOut?: string;
    topRoom?: string;
    notTopRoom?: string;
    unknownHeated?: boolean;
    rejectDouble?: boolean;
    nextAction?: string;
  };
};

export const scenarios: Scenario[] = [
  {
    id: "happy-goa-weekend",
    title: "Goa this weekend, 3 adults, private",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
    ],
    expect: {
      destination: "Goa",
      adults: 3,
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      topRoom: "anjuna-pool-villa",
      nextAction: "recommend",
    },
  },
  {
    id: "next-weekend",
    title: "Relative next weekend",
    turns: ["Need something in Goa next weekend for 2 people, private pool under 20k."],
    expect: {
      checkIn: "2026-09-18",
      checkOut: "2026-09-20",
      notTopRoom: "anjuna-pool-villa",
    },
  },
  {
    id: "family",
    title: "Wife and two kids",
    turns: ["Travelling with my wife and 2 kids. Goa this weekend."],
    expect: { adults: 2, children: 2, destination: "Goa" },
  },
  {
    id: "budget",
    title: "Private pool under 20k",
    turns: ["Something with a private pool under 20k in Goa this weekend for 2."],
    expect: { topRoom: "anjuna-pool-villa" },
  },
  {
    id: "patch-party",
    title: "Change to 4 people and stay till the 13th",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
      "Actually make that 4 people and stay till the 13th.",
    ],
    expect: {
      adults: 4,
      destination: "Goa",
      checkOut: "2026-09-13",
    },
  },
  {
    id: "one-more-night",
    title: "Stay one more night",
    turns: [
      "Need Goa this weekend for 2, private.",
      "Stay one more night.",
    ],
    expect: { checkOut: "2026-09-15", destination: "Goa" },
  },
  {
    id: "sold-out",
    title: "Villa sold out next weekend",
    turns: ["Private pool villa in Goa next weekend for 3, under 20k."],
    expect: { notTopRoom: "anjuna-pool-villa" },
  },
  {
    id: "capacity",
    title: "Five guests vs double room",
    turns: ["Five of us in Goa this weekend, a double room please."],
    expect: { rejectDouble: true },
  },
  {
    id: "heated",
    title: "Unknown heated pool",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
      "Is the pool heated?",
    ],
    expect: { unknownHeated: true },
  },
  {
    id: "alibaug-not-goa",
    title: "Goa search does not return Alibaug",
    turns: ["Goa this weekend for 2, private."],
    expect: { destination: "Goa", topRoom: "anjuna-pool-villa" },
  },
  {
    id: "recovery-other",
    title: "What about the other one",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
      "what about the other one?",
    ],
    expect: { nextAction: "recommend" },
  },
  {
    id: "too-expensive",
    title: "Too expensive",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
      "too expensive",
    ],
    expect: { nextAction: "price" },
  },
  {
    id: "yes-hold",
    title: "Yes after a recommendation",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
      "yes",
    ],
    expect: { nextAction: "hold" },
  },
  {
    id: "price-matches-tool",
    title: "Quoted total matches calculate_price",
    turns: [
      "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
    ],
    expect: { topRoom: "anjuna-pool-villa" },
  },
  {
    id: "missing-dates",
    title: "Ask when dates missing",
    turns: ["Need something in Goa for 2 people."],
    expect: { nextAction: "ask", destination: "Goa" },
  },
];

export async function play(turns: string[]) {
  const db = createDb(":memory:");
  await seedCatalog(db);
  const today = todayIso();
  const nowIso = "2026-09-12T08:00:00.000Z";
  let state: BookingState = emptyBookingState();
  let lastSearch: Awaited<ReturnType<typeof searchProperties>> | null = null;
  let lastDetails: Awaited<ReturnType<typeof getRoomDetails>> | null = null;
  let lastQuote: Awaited<ReturnType<typeof calculatePrice>> | null = null;

  for (const message of turns) {
    const extracted = fallbackExtract(message);
    state = applySlotPatch(state, extractedToPatch(extracted), today);
    state = applyRecovery(state, extracted.recovery);
    state.nextAction = nextActionAfterMerge(state, extracted.askedFacts);

    if (state.nextAction === "ask") continue;

    if (state.destination && state.checkIn && state.checkOut && state.adults > 0) {
      lastSearch = await searchProperties(db, {
        destination: state.destination,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        adults: state.adults,
        children: state.children,
        budgetPerNight: state.budgetPerNight,
        privacy: state.privacy,
        amenityNeed: state.amenities,
        nowIso,
      });
      state.lastRecommendations = lastSearch.matches.slice(0, 3).map((room) => ({
        propertyId: room.propertyId,
        roomId: room.roomId,
        reason: room.roomName,
        nightlyRate: room.nightlyRate,
      }));
      if (lastSearch.matches[0] && !state.selectedRoomId) {
        state.selectedRoomId = lastSearch.matches[0].roomId;
        state.selectedPropertyId = lastSearch.matches[0].propertyId;
      }
      if (lastSearch.matches.length > 0 && state.nextAction === "search") {
        state.nextAction = "recommend";
      }
    }

    if (extracted.askedFacts.length && state.selectedRoomId) {
      lastDetails = await getRoomDetails(db, {
        roomId: state.selectedRoomId,
        askedFacts: extracted.askedFacts,
      });
    }

    if (state.nextAction === "price" && state.selectedRoomId && state.checkIn && state.checkOut) {
      lastQuote = await calculatePrice(db, {
        roomId: state.selectedRoomId,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        adults: state.adults,
        children: state.children,
      });
    }
  }

  return { state, lastSearch, lastDetails, lastQuote };
}
