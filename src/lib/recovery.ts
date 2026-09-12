import type { BookingState, NextAction } from "./types";

export type RecoveryCue =
  | "yes"
  | "too_expensive"
  | "whichever"
  | "the_other"
  | "cheaper"
  | "none";

export function applyRecovery(
  state: BookingState,
  cue: RecoveryCue,
): BookingState {
  const recs = state.lastRecommendations;
  switch (cue) {
    case "none":
      return state;
    case "yes": {
      const selectedRoomId = state.selectedRoomId ?? recs[0]?.roomId ?? null;
      if (!selectedRoomId) return { ...state, intent: "search" };
      return {
        ...state,
        selectedRoomId,
        selectedPropertyId:
          state.selectedPropertyId ?? recs[0]?.propertyId ?? null,
        nextAction: "hold",
        intent: "book",
      };
    }
    case "whichever": {
      const pick = recs[0];
      return {
        ...state,
        selectedRoomId: pick?.roomId ?? state.selectedRoomId,
        selectedPropertyId: pick?.propertyId ?? state.selectedPropertyId,
        nextAction: pick ? "recommend" : "search",
      };
    }
    case "the_other": {
      const pick = recs[1] ?? recs[0];
      return {
        ...state,
        selectedRoomId: pick?.roomId ?? null,
        selectedPropertyId: pick?.propertyId ?? null,
        nextAction: pick ? "recommend" : "search",
      };
    }
    case "too_expensive":
    case "cheaper": {
      const cheaper = [...recs].sort((a, b) => a.nightlyRate - b.nightlyRate)[0];
      return {
        ...state,
        selectedRoomId: cheaper?.roomId ?? null,
        selectedPropertyId: cheaper?.propertyId ?? null,
        nextAction: cheaper ? "price" : "search",
        intent: "price",
      };
    }
    default: {
      const _exhaustive: never = cue;
      return _exhaustive;
    }
  }
}

export function selectRoomFromUtterance(
  state: BookingState,
  message: string,
): BookingState {
  const recs = state.lastRecommendations;
  if (recs.length === 0) return state;
  const msg = message.toLowerCase();
  let best = recs[0];
  let bestScore = 0;
  for (const room of recs) {
    const fields = [
      room.reason,
      room.roomId.replaceAll("-", " "),
      room.propertyId.replaceAll("-", " "),
    ];
    let score = 0;
    for (const field of fields) {
      const text = field.toLowerCase();
      if (text.length >= 5 && msg.includes(text)) score += 20 + text.length;
      for (const token of text.split(/[^a-z0-9]+/)) {
        if (token.length >= 4 && msg.includes(token)) score += token.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = room;
    }
  }
  if (bestScore < 5) return state;
  return {
    ...state,
    selectedRoomId: best.roomId,
    selectedPropertyId: best.propertyId,
  };
}

export function nextActionAfterMerge(
  state: BookingState,
  askedFacts: string[],
): NextAction {
  if (askedFacts.length > 0 && state.selectedRoomId) return "policy";
  if (askedFacts.length > 0) return "policy";
  if (state.missingSlots.length > 0) return "ask";
  if (state.intent === "book" || state.nextAction === "hold") {
    if (state.selectedRoomId || state.bookingHoldId) return "hold";
    return "search";
  }
  if (state.intent === "price" || state.nextAction === "price") return "price";
  if (state.nextAction === "recommend" && state.selectedRoomId) return "recommend";
  if (state.intent === "policy") return "policy";
  if (state.lastRecommendations.length > 0 && state.intent === "refine") {
    return "search";
  }
  return "search";
}
