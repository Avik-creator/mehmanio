export type GuestIntent =
  | "search"
  | "refine"
  | "policy"
  | "price"
  | "book"
  | "reject"
  | "smalltalk"
  | "unknown";

export type NextAction =
  | "ask"
  | "search"
  | "recommend"
  | "price"
  | "policy"
  | "hold"
  | "upsell"
  | "recover";

export type BookingState = {
  destination: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  adults: number;
  children: number;
  budgetPerNight: number | null;
  currency: "INR";
  privacy: "private" | "any" | null;
  amenities: string[];
  roomType: string | null;
  specialRequirements: string | null;
  selectedPropertyId: string | null;
  selectedRoomId: string | null;
  lastRecommendations: Array<{
    propertyId: string;
    roomId: string;
    reason: string;
    nightlyRate: number;
  }>;
  lastQuotedTotal: number | null;
  lastQuestion: string | null;
  bookingHoldId: string | null;
  missingSlots: string[];
  nextAction: NextAction;
  intent: GuestIntent;
};

export type SlotPatch = {
  intent?: GuestIntent;
  destination?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  addNights?: number;
  adults?: number;
  children?: number;
  budgetPerNight?: number | null;
  privacy?: "private" | "any" | null;
  amenities?: string[];
  roomType?: string | null;
  specialRequirements?: string | null;
  relativeDates?: "this_weekend" | "next_weekend" | null;
};

export type ToolTrace = {
  name: string;
  args: unknown;
  result: unknown;
  error?: string;
};

export type AgentTurn = {
  reply: string;
  state: BookingState;
  traces: ToolTrace[];
  nextAction: NextAction;
  errors: string[];
  today: string;
};
