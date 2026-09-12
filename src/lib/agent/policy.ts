import type { NextAction } from "../types";

export const MIRA_TOOL_NAMES = [
  "search_properties",
  "check_availability",
  "get_room_details",
  "calculate_price",
  "get_policy",
  "create_booking_hold",
  "confirm_booking_hold",
  "list_addons",
] as const;

export type MiraToolName = (typeof MIRA_TOOL_NAMES)[number];

export function primaryToolForAction(
  action: NextAction,
  hasHold: boolean,
  switchingRoom = false,
): MiraToolName | null {
  switch (action) {
    case "ask":
      return null;
    case "search":
    case "recommend":
    case "recover":
    case "upsell":
      return "search_properties";
    case "price":
      return "calculate_price";
    case "policy":
      return "get_room_details";
    case "hold":
      if (hasHold && !switchingRoom) return "confirm_booking_hold";
      return "create_booking_hold";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function activeToolsForAction(
  action: NextAction,
  hasHold: boolean,
  switchingRoom = false,
): MiraToolName[] {
  const primary = primaryToolForAction(action, hasHold, switchingRoom);
  if (primary == null) return [];

  const extras: MiraToolName[] = [];
  switch (action) {
    case "ask":
      break;
    case "search":
    case "recommend":
    case "recover":
      extras.push("check_availability", "calculate_price", "get_room_details");
      break;
    case "price":
      extras.push("create_booking_hold", "list_addons");
      break;
    case "hold":
      if (!(hasHold && !switchingRoom)) extras.push("calculate_price", "list_addons");
      break;
    case "policy":
      extras.push("get_policy");
      break;
    case "upsell":
      extras.push("list_addons", "calculate_price");
      break;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }

  return [primary, ...extras.filter((name) => name !== primary)];
}

export function toolChoiceForStep(
  action: NextAction,
  stepNumber: number,
  hasHold: boolean,
  switchingRoom = false,
): "auto" | "none" | { type: "tool"; toolName: MiraToolName } {
  const primary = primaryToolForAction(action, hasHold, switchingRoom);
  if (primary == null) return "none";
  if (stepNumber === 0) {
    // When creating a *new* hold the model may want to price first — let it.
    // When *confirming* an existing hold, force the confirm tool directly.
    if (action === "hold" && !hasHold && !switchingRoom) return "auto";
    return { type: "tool", toolName: primary };
  }
  return "auto";
}

export function normalizeToolName(
  name: string,
  tools: readonly string[],
): string | null {
  const stripped = name
    .replace(/^functions[/.:]/, "")
    .replace(/^function[/.:]/, "");
  if (tools.includes(stripped)) return stripped;
  const suffix = stripped.split("/").pop() ?? stripped;
  if (tools.includes(suffix)) return suffix;
  return null;
}
