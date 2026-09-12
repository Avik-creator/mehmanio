import { z } from "zod";
import type { SlotPatch } from "../types";
import type { RecoveryCue } from "../recovery";
import { inferParty } from "../party";

export const extractSchema = z.object({
  intent: z.enum([
    "search",
    "refine",
    "policy",
    "price",
    "book",
    "reject",
    "smalltalk",
    "unknown",
  ]),
  destination: z.string().nullable(),
  relativeDates: z.enum(["this_weekend", "next_weekend"]).nullable(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  addNights: z.number().int().nullable(),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  budgetPerNight: z.number().nullable(),
  privacy: z.enum(["private", "any"]).nullable(),
  amenities: z.array(z.string()),
  roomType: z.string().nullable(),
  specialRequirements: z.string().nullable(),
  askedFacts: z.array(z.string()),
  recovery: z.enum([
    "yes",
    "too_expensive",
    "whichever",
    "the_other",
    "cheaper",
    "none",
  ]),
});

export type Extracted = z.infer<typeof extractSchema>;

export function emptyExtract(): Extracted {
  return {
    intent: "unknown",
    destination: null,
    relativeDates: null,
    checkIn: null,
    checkOut: null,
    addNights: null,
    adults: null,
    children: null,
    budgetPerNight: null,
    privacy: null,
    amenities: [],
    roomType: null,
    specialRequirements: null,
    askedFacts: [],
    recovery: "none",
  };
}

export function fallbackExtract(message: string): Extracted {
  const lower = message.trim().toLowerCase();
  const party = inferParty(message);
  const extracted = emptyExtract();
  extracted.adults = party.adults ?? null;
  extracted.children = party.children ?? null;

  if (/\bgoa\b/.test(lower)) extracted.destination = "Goa";
  if (/\balibaug\b/.test(lower)) extracted.destination = "Alibaug";
  if (lower.includes("next weekend")) extracted.relativeDates = "next_weekend";
  else if (lower.includes("this weekend")) extracted.relativeDates = "this_weekend";

  const till = lower.match(/till the (\d{1,2})/);
  if (till) extracted.checkOut = `2026-09-${till[1].padStart(2, "0")}`;
  if (lower.includes("one more night")) extracted.addNights = 1;
  if (lower.includes("private")) extracted.privacy = "private";
  if (lower.includes("pool")) extracted.amenities = ["private_pool"];
  const budget = lower.match(/under\s*(\d+)\s*k/);
  if (budget) extracted.budgetPerNight = Number(budget[1]) * 1000;
  if (/heated/.test(lower)) extracted.askedFacts = ["heated_pool"];

  if (
    /^(yes|ok|sure)\b/.test(lower) ||
    /\bconfirm\b/.test(lower) ||
    lower === "book it"
  ) {
    extracted.recovery = "yes";
    extracted.intent = "book";
  } else if (lower.includes("too expensive")) {
    extracted.recovery = "too_expensive";
    extracted.intent = "price";
  } else if (lower.includes("other one") || lower.includes("the other")) {
    extracted.recovery = "the_other";
    extracted.intent = "refine";
  } else if (lower.includes("cheaper") || lower.includes("any cheaper")) {
    extracted.recovery = "cheaper";
    extracted.intent = "price";
  } else if (lower.includes("whichever")) {
    extracted.recovery = "whichever";
    extracted.intent = "refine";
  } else if (extracted.askedFacts.length) {
    extracted.intent = "policy";
  } else if (extracted.destination || extracted.relativeDates || extracted.adults) {
    extracted.intent = extracted.adults && extracted.destination ? "search" : "refine";
  }

  return extracted;
}

export function extractedToPatch(extracted: Extracted): SlotPatch {
  const relative = extracted.relativeDates ?? undefined;
  return {
    intent: extracted.intent,
    destination: extracted.destination ?? undefined,
    relativeDates: relative,
    checkIn: relative ? undefined : (extracted.checkIn ?? undefined),
    checkOut: relative ? undefined : (extracted.checkOut ?? undefined),
    addNights: extracted.addNights ?? undefined,
    adults: extracted.adults ?? undefined,
    children: extracted.children ?? undefined,
    budgetPerNight: extracted.budgetPerNight ?? undefined,
    privacy: extracted.privacy ?? undefined,
    amenities: extracted.amenities,
    roomType: extracted.roomType ?? undefined,
    specialRequirements: extracted.specialRequirements ?? undefined,
  };
}

export function reconcileExtract(message: string, model: Extracted): Extracted {
  const fallback = fallbackExtract(message);
  const next: Extracted = { ...model, amenities: [...model.amenities] };
  if (fallback.relativeDates) {
    next.relativeDates = fallback.relativeDates;
    next.checkIn = null;
    next.checkOut = null;
  }
  if (fallback.destination && !next.destination) {
    next.destination = fallback.destination;
  }
  if (fallback.adults != null && next.adults == null) next.adults = fallback.adults;
  if (fallback.children != null && next.children == null) {
    next.children = fallback.children;
  }
  if (fallback.recovery !== "none" && next.recovery === "none") {
    next.recovery = fallback.recovery;
    next.intent = fallback.intent;
  }
  if (fallback.askedFacts.length && next.askedFacts.length === 0) {
    next.askedFacts = fallback.askedFacts;
  }
  return next;
}

export function recoveryFromExtract(extracted: Extracted): RecoveryCue {
  return extracted.recovery;
}
