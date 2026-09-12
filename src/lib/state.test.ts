import { describe, expect, test } from "vitest";
import { applySlotPatch, emptyBookingState, missingSlots } from "./state";

describe("applySlotPatch", () => {
  test("keeps destination when guest only changes party size and checkout", () => {
    const current = emptyBookingState();
    const withGoa = applySlotPatch(current, {
      destination: "Goa",
      adults: 3,
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
      privacy: "private",
    });

    const updated = applySlotPatch(withGoa, {
      adults: 4,
      checkOut: "2026-09-13",
    });

    expect(updated.destination).toBe("Goa");
    expect(updated.adults).toBe(4);
    expect(updated.checkIn).toBe("2026-09-12");
    expect(updated.checkOut).toBe("2026-09-13");
    expect(updated.nights).toBe(1);
    expect(updated.privacy).toBe("private");
  });

  test("relativeDates win over invented ISO dates in the same patch", () => {
    const updated = applySlotPatch(
      emptyBookingState(),
      {
        destination: "Goa",
        adults: 3,
        relativeDates: "this_weekend",
        checkIn: "2026-09-14",
        checkOut: "2026-09-16",
      },
      "2026-09-12",
    );

    expect(updated.checkIn).toBe("2026-09-12");
    expect(updated.checkOut).toBe("2026-09-14");
  });

  test("stay one more night extends checkout", () => {
    const current = applySlotPatch(emptyBookingState(), {
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
    });

    const updated = applySlotPatch(current, { addNights: 1 });

    expect(updated.checkOut).toBe("2026-09-15");
    expect(updated.nights).toBe(3);
  });

  test("does not clear budget when patch omits it", () => {
    const current = applySlotPatch(emptyBookingState(), {
      destination: "Goa",
      budgetPerNight: 20000,
    });

    const updated = applySlotPatch(current, { children: 2 });

    expect(updated.budgetPerNight).toBe(20000);
    expect(updated.children).toBe(2);
  });
});

describe("missingSlots", () => {
  test("requires destination, dates, and at least one guest", () => {
    expect(missingSlots(emptyBookingState())).toEqual([
      "destination",
      "dates",
      "guests",
    ]);
  });

  test("is empty when search-critical slots are set", () => {
    const state = applySlotPatch(emptyBookingState(), {
      destination: "Goa",
      adults: 3,
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
    });

    expect(missingSlots(state)).toEqual([]);
  });
});
