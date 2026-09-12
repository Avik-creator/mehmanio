import { groq } from "@ai-sdk/groq";
import { generateText, isStepCount, NoSuchToolError, Output } from "ai";
import type { MiraDb } from "../../db/client";
import { nowIso, todayIso } from "../clock";
import { formatStayLabel } from "../dates";
import { stripInventedPrices, ungroundedNumbers } from "../grounding";
import { inferParty } from "../party";
import {
  applyRecovery,
  nextActionAfterMerge,
  selectRoomFromUtterance,
} from "../recovery";
import { appendMessage, loadState, saveState } from "../sessions";
import { applySlotPatch } from "../state";
import type { AgentTurn, BookingState, ToolTrace } from "../types";
import { applyActiveHold, getActiveHold } from "../inventory";
import {
  extractSchema,
  extractedToPatch,
  fallbackExtract,
  reconcileExtract,
} from "./extract";
import {
  activeToolsForAction,
  normalizeToolName,
  primaryToolForAction,
  toolChoiceForStep,
} from "./policy";
import { createMiraTools, executeForcedTool } from "./tools";

function modelId() {
  return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
}

function model() {
  return groq(modelId());
}

function groqCallSettings() {
  const qwen = modelId().includes("qwen");
  return {
    temperature: 0 as const,
    maxOutputTokens: qwen ? 700 : 1024,
    reasoning: "none" as const,
    providerOptions: {
      groq: {
        reasoningEffort: "none" as const,
        parallelToolCalls: false,
      },
    },
  };
}

const EXTRACT_SYSTEM = `You extract booking slot updates for Mira, a hotel guest agent.
Today's date is given. Use ISO dates YYYY-MM-DD.
Rules:
- Return JSON only matching the schema.
- Only fill fields the guest just said. Use null when they did not mention a field.
- "2 friends and me" = 3 adults. "wife and 2 kids" = 2 adults, 2 children.
- "this weekend" / "next weekend" go in relativeDates. Leave checkIn and checkOut null for those phrases.
- "stay till the 13th" sets checkOut to that day in the current stay month.
- "one more night" sets addNights=1.
- "under 20k" is budgetPerNight in INR for the room, not per person, unless they said total.
- private pool / private villa => privacy=private and amenities including private_pool.
- Heated pool questions => askedFacts: ["heated_pool"].
- Short replies: yes / too expensive / whichever / the other one / cheaper / confirm set recovery.
- Do not invent prices.`;

const ACT_SYSTEM = `You are Mira, Mehman's guest-facing booking agent for a small inventory of stays in Goa and Alibaug.
You may only know facts from tools. Never invent prices, availability, amenities, capacity, or policy.
If a tool returns unknownFacts, say you do not have that on the listing.
If search returns rejected rooms for capacity or sold-out dates, explain and offer the next match.
Call calculate_price before quoting money.
Call create_booking_hold only when the guest agrees to a specific room.
If a hold already exists and the guest confirms, acknowledge it. Do not call tools. This desk does not take payment.
Use the stay label in the prompt. Never invent other dates or weekdays.
If you list rooms, use a GitHub-flavored markdown table with a blank line before it and one row per line.
Prefer one useful question over a form.
Keep replies short, warm, and specific. INR. No chain of thought.`;

function compactState(state: BookingState) {
  return {
    destination: state.destination,
    checkIn: state.checkIn,
    checkOut: state.checkOut,
    adults: state.adults,
    children: state.children,
    privacy: state.privacy,
    amenities: state.amenities,
    selectedRoomId: state.selectedRoomId,
    bookingHoldId: state.bookingHoldId,
    lastQuotedTotal: state.lastQuotedTotal,
    recs: state.lastRecommendations.map((room) => room.roomId),
    missing: state.missingSlots,
    nextAction: state.nextAction,
  };
}

function stayLine(state: BookingState): string {
  if (!state.checkIn || !state.checkOut) return "Stay: unknown";
  return `Stay: ${formatStayLabel(state.checkIn, state.checkOut)} (${state.checkIn} → ${state.checkOut}, ${state.nights ?? "?"} nights).`;
}

function isRejectedToolName(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /attempted to call tool .+ which was not in request\.tools/i.test(
    message,
  );
}

export async function extractTurn(
  message: string,
  state: BookingState,
  today: string,
) {
  const fallback = fallbackExtract(message);
  if (!process.env.GROQ_API_KEY) return fallback;

  try {
    const { output } = await generateText({
      model: model(),
      ...groqCallSettings(),
      maxOutputTokens: 400,
      output: Output.object({ schema: extractSchema }),
      system: EXTRACT_SYSTEM,
      prompt: `Today is ${today} (Asia/Kolkata).\nSlots: ${JSON.stringify(compactState(state))}\nGuest: ${message}\nReturn JSON.`,
    });
    return reconcileExtract(message, output ?? fallback);
  } catch {
    return fallback;
  }
}

export async function runTurn(args: {
  db: MiraDb;
  sessionId: string;
  message: string;
}): Promise<AgentTurn> {
  const today = todayIso();
  const currentNow = nowIso();
  const errors: string[] = [];
  const stored = await loadState(args.db, args.sessionId);
  const liveHold = await getActiveHold(args.db, args.sessionId, currentNow);
  const prior = applyActiveHold(stored, liveHold);
  await appendMessage(args.db, args.sessionId, "guest", args.message);

  const extracted = await extractTurn(args.message, prior, today);
  const party = inferParty(args.message);
  if (party.adults && extracted.adults == null) extracted.adults = party.adults;
  if (party.children && extracted.children == null) extracted.children = party.children;

  let state = applySlotPatch(prior, extractedToPatch(extracted), today);
  const named = selectRoomFromUtterance(state, args.message);
  const switchingRoom = Boolean(
    liveHold && named.selectedRoomId && named.selectedRoomId !== liveHold.roomId,
  );
  state = named;
  if (liveHold && !switchingRoom) {
    state = applyActiveHold(state, liveHold);
  }
  state = applyRecovery(state, extracted.recovery);
  if (liveHold && !switchingRoom) {
    state = applyActiveHold(state, liveHold);
  }
  state.nextAction = nextActionAfterMerge(state, extracted.askedFacts);
  await saveState(args.db, args.sessionId, state);

  const traces: ToolTrace[] = [];
  const ctx = {
    db: args.db,
    sessionId: args.sessionId,
    state,
    nowIso: currentNow,
    traces,
  };
  const tools = createMiraTools(ctx);
  const hasHold = Boolean(state.bookingHoldId);
  const primary = primaryToolForAction(state.nextAction, hasHold, switchingRoom);
  const activeTools = activeToolsForAction(state.nextAction, hasHold, switchingRoom);

  let rawReply = "";

  if (!process.env.GROQ_API_KEY) {
    errors.push("GROQ_API_KEY is missing");
    rawReply = localReply(state, extracted.askedFacts);
  } else if (state.nextAction === "ask" && extracted.askedFacts.length === 0) {
    try {
      const spoken = await generateText({
        model: model(),
        ...groqCallSettings(),
        system: ACT_SYSTEM,
        prompt: `${stayLine(state)}\nCanonical slots: ${JSON.stringify(compactState(state))}\nMissing: ${state.missingSlots.join(", ")}\nGuest: ${args.message}\nAsk one natural question. Do not invent inventory or dates.`,
      });
      rawReply = spoken.text;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ask failed");
      rawReply = localReply(state, extracted.askedFacts);
    }
  } else if (primary == null) {
    try {
      const spoken = await generateText({
        model: model(),
        ...groqCallSettings(),
        system: ACT_SYSTEM,
        prompt: `${stayLine(state)}\nCanonical slots: ${JSON.stringify(compactState(state))}\nGuest: ${args.message}\nA hold already exists. Confirm it. Do not call tools or invent payment.`,
      });
      rawReply = spoken.text;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "confirm failed");
      rawReply = localReply(ctx.state, extracted.askedFacts);
    }
  } else {
    try {
      const acted = await generateText({
        model: model(),
        ...groqCallSettings(),
        tools,
        activeTools,
        stopWhen: isStepCount(6),
        system: `${ACT_SYSTEM}\n${stayLine(state)}\nCanonical slots: ${JSON.stringify(compactState(state))}\nToday: ${today}\nAsked facts: ${JSON.stringify(extracted.askedFacts)}`,
        prompt: args.message,
        prepareStep: ({ stepNumber }) => ({
          toolChoice: toolChoiceForStep(
            state.nextAction,
            stepNumber,
            hasHold,
            switchingRoom,
          ),
          activeTools: activeToolsForAction(
            state.nextAction,
            hasHold,
            switchingRoom,
          ),
        }),
        repairToolCall: async ({ toolCall, error }) => {
          if (!NoSuchToolError.isInstance(error)) return null;
          const fixed = normalizeToolName(toolCall.toolName, Object.keys(tools));
          if (!fixed) return null;
          return { ...toolCall, toolName: fixed };
        },
      });
      rawReply = acted.text;
      if (!rawReply.trim()) {
        rawReply = await speakFromTraces(ctx.state, traces, args.message);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "tool loop failed");
      if (isRejectedToolName(error) && primary) {
        try {
          await executeForcedTool(ctx, primary);
          rawReply = await speakFromTraces(ctx.state, traces, args.message);
        } catch (forcedError) {
          errors.push(
            forcedError instanceof Error ? forcedError.message : "forced tool failed",
          );
          rawReply = localReply(ctx.state, extracted.askedFacts);
        }
      } else {
        rawReply = localReply(ctx.state, extracted.askedFacts);
      }
    }
  }

  const invented = ungroundedNumbers(rawReply, traces, ctx.state);
  const grounded = stripInventedPrices(rawReply, invented);
  const reply = grounded.reply;
  errors.push(...grounded.errors);

  await saveState(args.db, args.sessionId, ctx.state);
  await appendMessage(args.db, args.sessionId, "mira", reply);

  return {
    reply,
    state: ctx.state,
    traces,
    nextAction: ctx.state.nextAction,
    errors,
    today,
  };
}

async function speakFromTraces(
  state: BookingState,
  traces: ToolTrace[],
  message: string,
) {
  const spoken = await generateText({
    model: model(),
    ...groqCallSettings(),
    system: ACT_SYSTEM,
    prompt: `${stayLine(state)}\nSlots: ${JSON.stringify(compactState(state))}\nTool results: ${JSON.stringify(traces)}\nGuest: ${message}\nWrite the guest-facing reply. Numbers only from tool results. If you list rooms, one GFM table row per line. If unknownFacts, say so.`,
  });
  return spoken.text;
}

function localReply(state: BookingState, askedFacts: string[]): string {
  if (askedFacts.includes("heated_pool")) {
    return "I don't have heated-pool on the listing — only that there is a pool. I can note heated as a special ask if you want.";
  }
  if (state.missingSlots.includes("destination")) {
    return "Where are you hoping to stay? I have Goa and Alibaug on this desk.";
  }
  if (state.missingSlots.includes("dates")) {
    return "Which dates were you thinking? Even a rough window like this weekend works.";
  }
  if (state.missingSlots.includes("guests")) {
    return "How many people are travelling, including kids?";
  }
  if (state.bookingHoldId) {
    const room = state.lastRecommendations.find(
      (item) => item.roomId === state.selectedRoomId,
    );
    return `You're held${room ? `: ${room.reason}` : ""}. Hold ${state.bookingHoldId} is valid for 15 minutes. This desk doesn't take payment — that's confirmation here.`;
  }
  if (state.lastRecommendations[0]) {
    const top = state.lastRecommendations[0];
    return `I'd look at ${top.reason} first (₹${top.nightlyRate}/night before tax). Want me to price it for your dates?`;
  }
  if (state.nextAction === "hold" && state.selectedRoomId) {
    return `I can hold ${state.selectedRoomId} for 15 minutes while you confirm.`;
  }
  return "Tell me the city, dates, and how many people — I'll check what's actually free.";
}
