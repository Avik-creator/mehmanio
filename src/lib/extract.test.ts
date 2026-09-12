import { describe, expect, test } from "vitest";
import {
  emptyExtract,
  extractedToPatch,
  fallbackExtract,
  reconcileExtract,
} from "./agent/extract";
import { ungroundedNumbers } from "./grounding";
import { applySlotPatch, emptyBookingState } from "./state";

test("fallback extract understands the assignment happy-path sentence", () => {
  const extracted = fallbackExtract(
    "Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.",
  );
  expect(extracted.destination).toBe("Goa");
  expect(extracted.relativeDates).toBe("this_weekend");
  expect(extracted.adults).toBe(3);
  expect(extracted.privacy).toBe("private");
});

test("yes confirm is a booking recovery cue", () => {
  const extracted = fallbackExtract("Yes confirm");
  expect(extracted.recovery).toBe("yes");
  expect(extracted.intent).toBe("book");
});

test("reconcileExtract keeps this weekend over Groq-invented Friday-Sunday ISO dates", () => {
  const groq = emptyExtract();
  groq.destination = "Goa";
  groq.adults = 3;
  groq.checkIn = "2026-09-14";
  groq.checkOut = "2026-09-16";
  groq.relativeDates = null;

  const reconciled = reconcileExtract(
    "Goa this weekend for my 2 friends and me",
    groq,
  );

  expect(reconciled.relativeDates).toBe("this_weekend");
  expect(reconciled.checkIn).toBeNull();
  expect(reconciled.checkOut).toBeNull();
});

test("extractedToPatch does not pass invented ISO dates when relativeDates is set", () => {
  const extracted = emptyExtract();
  extracted.relativeDates = "this_weekend";
  extracted.checkIn = "2026-09-14";
  extracted.checkOut = "2026-09-16";
  const patch = extractedToPatch(extracted);
  expect(patch.relativeDates).toBe("this_weekend");
  expect(patch.checkIn).toBeUndefined();
  expect(patch.checkOut).toBeUndefined();
});

test("flags a price that never appeared in tool output", () => {
  const state = applySlotPatch(emptyBookingState(), {
    destination: "Goa",
    adults: 3,
    checkIn: "2026-09-12",
    checkOut: "2026-09-14",
  });
  const invented = ungroundedNumbers(
    "The villa is ₹99999 a night.",
    [{ name: "search_properties", args: {}, result: { matches: [{ nightlyRate: 18500 }] } }],
    state,
  );
  expect(invented.some((token) => token.includes("99999"))).toBe(true);
});
