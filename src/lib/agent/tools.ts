import { tool } from "ai";
import { z } from "zod";
import type { MiraDb } from "../../db/client";
import {
  calculatePrice,
  checkAvailability,
  confirmBookingHold,
  createBookingHold,
  getPolicy,
  getRoomDetails,
  listAddons,
  searchProperties,
} from "../inventory";
import type { BookingState, ToolTrace } from "../types";
import type { MiraToolName } from "./policy";

export type ToolContext = {
  db: MiraDb;
  sessionId: string;
  state: BookingState;
  nowIso: string;
  traces: ToolTrace[];
};

function trace(ctx: ToolContext, name: string, args: unknown, result: unknown) {
  ctx.traces.push({ name, args, result });
}

export function createMiraTools(ctx: ToolContext) {
  return {
    search_properties: tool({
      description:
        "Search inventory for rooms matching the guest. Use when destination, dates, and party size are known. Do not invent rooms.",
      inputSchema: z.object({
        destination: z.string().optional(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        adults: z.number().int().optional(),
        children: z.number().int().optional(),
        budgetPerNight: z.number().optional(),
        privacy: z.enum(["private", "any"]).optional(),
        amenities: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const destination = args.destination ?? ctx.state.destination;
        if (!destination) {
          const result = { error: "destination is missing" };
          trace(ctx, "search_properties", args, result);
          return result;
        }
        if (
          ctx.state.destination &&
          args.destination &&
          !ctx.state.destination.toLowerCase().includes(args.destination.toLowerCase()) &&
          !args.destination.toLowerCase().includes(ctx.state.destination.toLowerCase())
        ) {
          const result = {
            error: `guest destination is ${ctx.state.destination}, not ${args.destination}`,
          };
          trace(ctx, "search_properties", args, result);
          return result;
        }
        const checkIn = args.checkIn ?? ctx.state.checkIn;
        const checkOut = args.checkOut ?? ctx.state.checkOut;
        if (!checkIn || !checkOut) {
          const result = { error: "dates are missing" };
          trace(ctx, "search_properties", args, result);
          return result;
        }
        const result = await searchProperties(ctx.db, {
          destination,
          checkIn,
          checkOut,
          adults: args.adults ?? ctx.state.adults,
          children: args.children ?? ctx.state.children,
          budgetPerNight: args.budgetPerNight ?? ctx.state.budgetPerNight,
          privacy: args.privacy ?? ctx.state.privacy,
          amenityNeed: args.amenities ?? ctx.state.amenities,
          nowIso: ctx.nowIso,
          sessionId: ctx.sessionId,
        });
        ctx.state.lastRecommendations = result.matches.slice(0, 3).map((room) => ({
          propertyId: room.propertyId,
          roomId: room.roomId,
          reason: `${room.roomName} at ${room.propertyName}`,
          nightlyRate: room.nightlyRate,
        }));
        if (result.matches[0] && !ctx.state.bookingHoldId) {
          ctx.state.selectedRoomId = result.matches[0].roomId;
          ctx.state.selectedPropertyId = result.matches[0].propertyId;
          ctx.state.nextAction = "recommend";
        }
        trace(ctx, "search_properties", args, result);
        return result;
      },
    }),
    check_availability: tool({
      description: "Check date-level stock for one room, including active holds.",
      inputSchema: z.object({
        roomId: z.string(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
      }),
      execute: async (args) => {
        const checkIn = args.checkIn ?? ctx.state.checkIn;
        const checkOut = args.checkOut ?? ctx.state.checkOut;
        if (!checkIn || !checkOut) {
          const result = { error: "dates are missing" };
          trace(ctx, "check_availability", args, result);
          return result;
        }
        const result = await checkAvailability(ctx.db, {
          roomId: args.roomId,
          checkIn,
          checkOut,
          nowIso: ctx.nowIso,
          sessionId: ctx.sessionId,
        });
        trace(ctx, "check_availability", args, result);
        return result;
      },
    }),
    get_room_details: tool({
      description:
        "Fetch amenities, capacity, and copy for a room. Pass askedFacts such as heated_pool when the guest asks something that may be unknown.",
      inputSchema: z.object({
        roomId: z.string(),
        askedFacts: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const result = await getRoomDetails(ctx.db, args);
        trace(ctx, "get_room_details", args, result);
        return result;
      },
    }),
    calculate_price: tool({
      description:
        "Only way to quote money. Deterministic nights × rate + extra adults + add-ons + tax.",
      inputSchema: z.object({
        roomId: z.string(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        adults: z.number().int().optional(),
        children: z.number().int().optional(),
        addonIds: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const checkIn = args.checkIn ?? ctx.state.checkIn;
        const checkOut = args.checkOut ?? ctx.state.checkOut;
        if (!checkIn || !checkOut) {
          const result = { error: "dates are missing" };
          trace(ctx, "calculate_price", args, result);
          return result;
        }
        const result = await calculatePrice(ctx.db, {
          roomId: args.roomId,
          checkIn,
          checkOut,
          adults: args.adults ?? ctx.state.adults,
          children: args.children ?? ctx.state.children,
          addonIds: args.addonIds,
        });
        if (result.ok) {
          ctx.state.lastQuotedTotal = result.total;
          ctx.state.selectedRoomId = args.roomId;
          ctx.state.nextAction = "price";
        }
        trace(ctx, "calculate_price", args, result);
        return result;
      },
    }),
    get_policy: tool({
      description: "Read cancellation, check-in, pets, or kids policy from the listing. Never invent policy.",
      inputSchema: z.object({
        propertyId: z.string(),
        kind: z.enum(["cancellation", "check_in", "pets", "kids"]).optional(),
      }),
      execute: async (args) => {
        const result = await getPolicy(ctx.db, args);
        trace(ctx, "get_policy", args, result);
        return result;
      },
    }),
    create_booking_hold: tool({
      description:
        "Place a 15-minute hold that blocks inventory. Only after the guest agrees to a specific room.",
      inputSchema: z.object({
        roomId: z.string(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
      }),
      execute: async (args) => {
        const checkIn = args.checkIn ?? ctx.state.checkIn;
        const checkOut = args.checkOut ?? ctx.state.checkOut;
        if (!checkIn || !checkOut) {
          const result = { error: "dates are missing" };
          trace(ctx, "create_booking_hold", args, result);
          return result;
        }
        const result = await createBookingHold(ctx.db, {
          sessionId: ctx.sessionId,
          roomId: args.roomId,
          checkIn,
          checkOut,
          nowIso: ctx.nowIso,
        });
        if (result.ok) {
          ctx.state.bookingHoldId = result.holdId;
          ctx.state.selectedRoomId = args.roomId;
          ctx.state.nextAction = "hold";
        }
        trace(ctx, "create_booking_hold", args, result);
        return result;
      },
    }),
    confirm_booking_hold: tool({
      description:
        "Confirm the guest's existing 15-minute hold for this session. Do not check availability again — the hold already owns the inventory.",
      inputSchema: z.object({
        holdId: z.string().optional(),
      }),
      execute: async (args) => {
        const holdId = args.holdId ?? ctx.state.bookingHoldId;
        if (!holdId) {
          const result = { error: "no hold on this session" };
          trace(ctx, "confirm_booking_hold", args, result);
          return result;
        }
        const result = await confirmBookingHold(ctx.db, {
          holdId,
          sessionId: ctx.sessionId,
          nowIso: ctx.nowIso,
        });
        if (result.ok) {
          ctx.state.bookingHoldId = result.holdId;
          ctx.state.selectedRoomId = result.roomId;
          ctx.state.nextAction = "hold";
        }
        trace(ctx, "confirm_booking_hold", args, result);
        return result;
      },
    }),
    list_addons: tool({
      description: "List optional add-ons for a property. Offer at most one, only when relevant.",
      inputSchema: z.object({ propertyId: z.string() }),
      execute: async (args) => {
        const result = await listAddons(ctx.db, args.propertyId);
        trace(ctx, "list_addons", args, result);
        return result;
      },
    }),
  };
}

export async function executeForcedTool(ctx: ToolContext, name: MiraToolName) {
  const tools = createMiraTools(ctx);
  const args: Record<string, unknown> =
    name === "search_properties"
      ? {}
      : name === "confirm_booking_hold"
        ? ctx.state.bookingHoldId
          ? { holdId: ctx.state.bookingHoldId }
          : {}
      : name === "get_policy" || name === "list_addons"
        ? ctx.state.selectedPropertyId
          ? { propertyId: ctx.state.selectedPropertyId }
          : {}
        : ctx.state.selectedRoomId
          ? { roomId: ctx.state.selectedRoomId }
          : {};
  const execute = tools[name].execute;
  if (!execute) return;
  await execute(args as never, {
    toolCallId: `forced_${name}`,
    messages: [],
  } as never);
}
