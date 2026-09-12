import { describe, expect, test } from "vitest";
import {
  applyRecovery,
  nextActionAfterMerge,
  selectRoomFromUtterance,
} from "./recovery";
import { applySlotPatch, emptyBookingState } from "./state";

function stateWithRecs() {
  const base = applySlotPatch(emptyBookingState(), {
    destination: "Goa",
    adults: 3,
    checkIn: "2026-09-12",
    checkOut: "2026-09-14",
  });
  return {
    ...base,
    lastRecommendations: [
      {
        propertyId: "casa-anjuna",
        roomId: "anjuna-pool-villa",
        reason: "Private Pool Villa at Casa Anjuna",
        nightlyRate: 18500,
      },
      {
        propertyId: "casa-anjuna",
        roomId: "anjuna-garden-suite",
        reason: "Garden Suite at Casa Anjuna",
        nightlyRate: 12000,
      },
      {
        propertyId: "palolem-house",
        roomId: "palolem-studio",
        reason: "Palm Studio at Palolem House",
        nightlyRate: 7000,
      },
    ],
    lastQuotedTotal: 47040,
    selectedRoomId: "anjuna-pool-villa",
    selectedPropertyId: "casa-anjuna",
  };
}

describe("applyRecovery", () => {
  test("yes keeps the selected room and moves to hold", () => {
    const next = applyRecovery(stateWithRecs(), "yes");
    expect(next.selectedRoomId).toBe("anjuna-pool-villa");
    expect(next.nextAction).toBe("hold");
  });

  test("the other one selects the second recommendation", () => {
    const next = applyRecovery(stateWithRecs(), "the_other");
    expect(next.selectedRoomId).toBe("anjuna-garden-suite");
    expect(next.nextAction).toBe("recommend");
  });

  test("too expensive / cheaper points at the lower-rate option", () => {
    const next = applyRecovery(stateWithRecs(), "too_expensive");
    expect(next.selectedRoomId).toBe("palolem-studio");
    expect(next.nextAction).toBe("price");
  });

  test("yes after an existing hold keeps that room instead of jumping to recs[0]", () => {
    const held = {
      ...stateWithRecs(),
      selectedRoomId: "palolem-studio",
      selectedPropertyId: "palolem-house",
      bookingHoldId: "hold_existing",
    };
    const next = applyRecovery(held, "yes");
    expect(next.selectedRoomId).toBe("palolem-studio");
    expect(next.bookingHoldId).toBe("hold_existing");
    expect(next.nextAction).toBe("hold");
  });

  test("yes with no room yet does not hold", () => {
    const ready = applySlotPatch(emptyBookingState(), {
      destination: "Goa",
      adults: 3,
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
    });
    const next = applyRecovery(ready, "yes");
    expect(next.nextAction).not.toBe("hold");
    expect(next.selectedRoomId).toBeNull();
  });
});

describe("selectRoomFromUtterance", () => {
  test("matches a named property from recommendation copy, not a hardcoded hotel list", () => {
    const next = selectRoomFromUtterance(
      stateWithRecs(),
      "Yes Palolem house it will be.",
    );
    expect(next.selectedRoomId).toBe("palolem-studio");
    expect(next.selectedPropertyId).toBe("palolem-house");
  });

  test("matches a room name the guest typed", () => {
    const next = selectRoomFromUtterance(stateWithRecs(), "Palm Studio");
    expect(next.selectedRoomId).toBe("palolem-studio");
  });

  test("does not treat a bare yes as a room pick", () => {
    const next = selectRoomFromUtterance(stateWithRecs(), "Yes");
    expect(next.selectedRoomId).toBe("anjuna-pool-villa");
  });
});

describe("nextActionAfterMerge", () => {
  test("book with no selected room searches instead of holding air", () => {
    const ready = applySlotPatch(emptyBookingState(), {
      destination: "Goa",
      adults: 3,
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      intent: "book",
    });
    expect(nextActionAfterMerge(ready, [])).toBe("search");
  });

  test("book with a selected room holds", () => {
    expect(nextActionAfterMerge(stateWithRecs(), [])).toBe("search");
    const booked = { ...stateWithRecs(), intent: "book" as const };
    expect(nextActionAfterMerge(booked, [])).toBe("hold");
  });
});
