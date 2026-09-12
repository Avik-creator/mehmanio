import { addNights } from "../lib/dates";
import type { MiraDb } from "./client";
import {
  addons,
  amenities,
  bookingHolds,
  inventory,
  messages,
  policies,
  properties,
  rooms,
  sessions,
} from "./schema";

const START = "2026-09-12";
const DAYS = 21;

function datesFrom(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addNights(start, index));
}

export async function seedCatalog(db: MiraDb): Promise<void> {
  await db.delete(bookingHolds);
  await db.delete(messages);
  await db.delete(sessions);
  await db.delete(inventory);
  await db.delete(addons);
  await db.delete(amenities);
  await db.delete(policies);
  await db.delete(rooms);
  await db.delete(properties);

  await db.insert(properties).values([
    {
      id: "casa-anjuna",
      name: "Casa Anjuna",
      destination: "Goa",
      area: "Anjuna, North Goa",
      description:
        "Private villas and rooms behind a wall in Anjuna. Built for small groups who want a pool without a hotel lobby.",
      taxPercent: 12,
    },
    {
      id: "palolem-house",
      name: "Palolem House",
      destination: "Goa",
      area: "Palolem, South Goa",
      description:
        "A family guesthouse a short walk from Palolem beach. Lower rates, rooms that fit kids.",
      taxPercent: 12,
    },
    {
      id: "alibaug-cliff",
      name: "Alibaug Cliff Stay",
      destination: "Alibaug",
      area: "Nagoa, Alibaug",
      description:
        "Cliff-edge rooms facing the Arabian Sea. Not Goa. Useful when someone is travelling from Mumbai.",
      taxPercent: 12,
    },
  ]);

  await db.insert(rooms).values([
    {
      id: "anjuna-pool-villa",
      propertyId: "casa-anjuna",
      name: "Private Pool Villa",
      roomType: "villa",
      nightlyRate: 18500,
      extraAdultFee: 2500,
      includedGuests: 2,
      maxAdults: 4,
      maxChildren: 2,
      maxGuests: 4,
      isPrivate: 1,
      description: "Standalone villa with a private plunge pool. No shared walls.",
    },
    {
      id: "anjuna-garden-suite",
      propertyId: "casa-anjuna",
      name: "Garden Suite",
      roomType: "suite",
      nightlyRate: 12000,
      extraAdultFee: 1800,
      includedGuests: 2,
      maxAdults: 3,
      maxChildren: 1,
      maxGuests: 3,
      isPrivate: 1,
      description: "Garden-facing suite. Quiet, no private pool.",
    },
    {
      id: "anjuna-sea-view",
      propertyId: "casa-anjuna",
      name: "Sea View Room",
      roomType: "double",
      nightlyRate: 9000,
      extraAdultFee: 1500,
      includedGuests: 2,
      maxAdults: 2,
      maxChildren: 1,
      maxGuests: 2,
      isPrivate: 0,
      description: "Upper-floor double with a sea slice. Shared garden.",
    },
    {
      id: "palolem-family",
      propertyId: "palolem-house",
      name: "Family Cottage",
      roomType: "cottage",
      nightlyRate: 11000,
      extraAdultFee: 1200,
      includedGuests: 3,
      maxAdults: 6,
      maxChildren: 3,
      maxGuests: 6,
      isPrivate: 0,
      description: "Two-room cottage for families. Cots on request.",
    },
    {
      id: "palolem-double",
      propertyId: "palolem-house",
      name: "Double Room",
      roomType: "double",
      nightlyRate: 4500,
      extraAdultFee: 800,
      includedGuests: 2,
      maxAdults: 2,
      maxChildren: 0,
      maxGuests: 2,
      isPrivate: 0,
      description: "Standard double. Two adults only.",
    },
    {
      id: "palolem-studio",
      propertyId: "palolem-house",
      name: "Palm Studio",
      roomType: "studio",
      nightlyRate: 7000,
      extraAdultFee: 1000,
      includedGuests: 2,
      maxAdults: 3,
      maxChildren: 1,
      maxGuests: 3,
      isPrivate: 0,
      description: "Studio with a kitchenette near the palms.",
    },
    {
      id: "cliff-villa",
      propertyId: "alibaug-cliff",
      name: "Cliff Villa",
      roomType: "villa",
      nightlyRate: 16000,
      extraAdultFee: 2000,
      includedGuests: 2,
      maxAdults: 4,
      maxChildren: 2,
      maxGuests: 4,
      isPrivate: 1,
      description: "Private cliff villa. Mumbai weekend crowd, not Goa.",
    },
    {
      id: "cliff-room",
      propertyId: "alibaug-cliff",
      name: "Cliff Room",
      roomType: "double",
      nightlyRate: 8000,
      extraAdultFee: 1200,
      includedGuests: 2,
      maxAdults: 2,
      maxChildren: 1,
      maxGuests: 2,
      isPrivate: 0,
      description: "Sea-facing double in the main house.",
    },
  ]);

  await db.insert(amenities).values([
    { roomId: "anjuna-pool-villa", name: "private_pool" },
    { roomId: "anjuna-pool-villa", name: "pool" },
    { roomId: "anjuna-pool-villa", name: "wifi" },
    { roomId: "anjuna-pool-villa", name: "ac" },
    { roomId: "anjuna-pool-villa", name: "kitchen" },
    { roomId: "anjuna-garden-suite", name: "wifi" },
    { roomId: "anjuna-garden-suite", name: "ac" },
    { roomId: "anjuna-garden-suite", name: "garden" },
    { roomId: "anjuna-sea-view", name: "wifi" },
    { roomId: "anjuna-sea-view", name: "ac" },
    { roomId: "anjuna-sea-view", name: "shared_pool" },
    { roomId: "palolem-family", name: "wifi" },
    { roomId: "palolem-family", name: "ac" },
    { roomId: "palolem-family", name: "cots" },
    { roomId: "palolem-double", name: "wifi" },
    { roomId: "palolem-double", name: "ac" },
    { roomId: "palolem-studio", name: "wifi" },
    { roomId: "palolem-studio", name: "kitchenette" },
    { roomId: "cliff-villa", name: "private_pool" },
    { roomId: "cliff-villa", name: "pool" },
    { roomId: "cliff-villa", name: "wifi" },
    { roomId: "cliff-villa", name: "ac" },
    { roomId: "cliff-room", name: "wifi" },
    { roomId: "cliff-room", name: "ac" },
  ]);

  await db.insert(policies).values([
    {
      propertyId: "casa-anjuna",
      kind: "cancellation",
      body: "Free cancellation until 72 hours before check-in. After that, one night is charged.",
    },
    {
      propertyId: "casa-anjuna",
      kind: "check_in",
      body: "Check-in from 14:00. Check-out by 11:00.",
    },
    {
      propertyId: "casa-anjuna",
      kind: "pets",
      body: "Pets are not allowed.",
    },
    {
      propertyId: "casa-anjuna",
      kind: "kids",
      body: "Children are welcome in the Garden Suite. The Pool Villa is better for adults.",
    },
    {
      propertyId: "palolem-house",
      kind: "cancellation",
      body: "Free cancellation until 48 hours before check-in.",
    },
    {
      propertyId: "palolem-house",
      kind: "check_in",
      body: "Check-in from 13:00. Check-out by 10:30.",
    },
    {
      propertyId: "palolem-house",
      kind: "pets",
      body: "Small pets allowed with prior notice. ₹1,000 cleaning fee.",
    },
    {
      propertyId: "palolem-house",
      kind: "kids",
      body: "Kids stay free under 5 in the Family Cottage. Cots available.",
    },
    {
      propertyId: "alibaug-cliff",
      kind: "cancellation",
      body: "Non-refundable within 7 days of arrival.",
    },
    {
      propertyId: "alibaug-cliff",
      kind: "check_in",
      body: "Check-in from 15:00. Check-out by 11:00.",
    },
    {
      propertyId: "alibaug-cliff",
      kind: "pets",
      body: "Pets are not allowed.",
    },
    {
      propertyId: "alibaug-cliff",
      kind: "kids",
      body: "Children welcome. No extra cot inventory.",
    },
  ]);

  await db.insert(addons).values([
    {
      id: "anjuna-breakfast",
      propertyId: "casa-anjuna",
      name: "Breakfast",
      description: "Cooked breakfast at the villa.",
      priceInr: 800,
      priceType: "per_person_per_night",
    },
    {
      id: "anjuna-pickup",
      propertyId: "casa-anjuna",
      name: "Airport pickup",
      description: "GOX airport transfer in an Innova.",
      priceInr: 2500,
      priceType: "per_stay",
    },
    {
      id: "anjuna-late",
      propertyId: "casa-anjuna",
      name: "Late checkout",
      description: "Checkout at 15:00 subject to the next booking.",
      priceInr: 1500,
      priceType: "per_stay",
    },
    {
      id: "palolem-breakfast",
      propertyId: "palolem-house",
      name: "Breakfast",
      description: "South Indian and eggs in the courtyard.",
      priceInr: 450,
      priceType: "per_person_per_night",
    },
    {
      id: "palolem-pickup",
      propertyId: "palolem-house",
      name: "Airport pickup",
      description: "GOX to Palolem.",
      priceInr: 3200,
      priceType: "per_stay",
    },
    {
      id: "cliff-breakfast",
      propertyId: "alibaug-cliff",
      name: "Breakfast",
      description: "Breakfast on the cliff deck.",
      priceInr: 700,
      priceType: "per_person_per_night",
    },
    {
      id: "cliff-pickup",
      propertyId: "alibaug-cliff",
      name: "Mumbai pickup",
      description: "South Mumbai to Alibaug via ferry coordination.",
      priceInr: 4000,
      priceType: "per_stay",
    },
  ]);

  const soldOutVillaNights = new Set(["2026-09-18", "2026-09-19"]);
  const allDates = datesFrom(START, DAYS);
  const roomIds = [
    "anjuna-pool-villa",
    "anjuna-garden-suite",
    "anjuna-sea-view",
    "palolem-family",
    "palolem-double",
    "palolem-studio",
    "cliff-villa",
    "cliff-room",
  ];

  await db.insert(inventory).values(
    roomIds.flatMap((roomId) =>
      allDates.map((date) => ({
        roomId,
        date,
        available:
          roomId === "anjuna-pool-villa" && soldOutVillaNights.has(date)
            ? 0
            : 1,
      })),
    ),
  );
}
