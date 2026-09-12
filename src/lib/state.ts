import { addNights, nightsBetween, resolveRelativeDates } from "./dates";
import type { BookingState, NextAction, SlotPatch } from "./types";

export function emptyBookingState(): BookingState {
  return {
    destination: null,
    checkIn: null,
    checkOut: null,
    nights: null,
    adults: 0,
    children: 0,
    budgetPerNight: null,
    currency: "INR",
    privacy: null,
    amenities: [],
    roomType: null,
    specialRequirements: null,
    selectedPropertyId: null,
    selectedRoomId: null,
    lastRecommendations: [],
    lastQuotedTotal: null,
    lastQuestion: null,
    bookingHoldId: null,
    missingSlots: ["destination", "dates", "guests"],
    nextAction: "ask",
    intent: "unknown",
  };
}

export function missingSlots(state: BookingState): string[] {
  const missing: string[] = [];
  if (!state.destination) missing.push("destination");
  if (!state.checkIn || !state.checkOut) missing.push("dates");
  if (state.adults + state.children < 1) missing.push("guests");
  return missing;
}

function refreshDerived(state: BookingState): BookingState {
  const nights =
    state.checkIn && state.checkOut
      ? nightsBetween(state.checkIn, state.checkOut)
      : null;
  const missing = missingSlots({ ...state, nights });
  const nextAction: NextAction = missing.length > 0 ? "ask" : state.nextAction;
  return { ...state, nights, missingSlots: missing, nextAction };
}

export function applySlotPatch(
  current: BookingState,
  patch: SlotPatch,
  todayIso?: string,
): BookingState {
  const next: BookingState = { ...current, amenities: [...current.amenities] };

  if (patch.intent) next.intent = patch.intent;
  if (patch.destination !== undefined) next.destination = patch.destination;
  if (patch.adults !== undefined) next.adults = patch.adults;
  if (patch.children !== undefined) next.children = patch.children;
  if (patch.budgetPerNight !== undefined) {
    next.budgetPerNight = patch.budgetPerNight;
  }
  if (patch.privacy !== undefined) next.privacy = patch.privacy;
  if (patch.amenities) {
    next.amenities = [...new Set([...next.amenities, ...patch.amenities])];
  }
  if (patch.roomType !== undefined) next.roomType = patch.roomType;
  if (patch.specialRequirements !== undefined) {
    next.specialRequirements = patch.specialRequirements;
  }

  if (patch.checkIn !== undefined) next.checkIn = patch.checkIn;
  if (patch.checkOut !== undefined) next.checkOut = patch.checkOut;

  if (patch.relativeDates && todayIso) {
    const range = resolveRelativeDates(patch.relativeDates, todayIso);
    next.checkIn = range.checkIn;
    next.checkOut = range.checkOut;
  }

  if (patch.addNights && next.checkOut) {
    next.checkOut = addNights(next.checkOut, patch.addNights);
  }

  return refreshDerived(next);
}
