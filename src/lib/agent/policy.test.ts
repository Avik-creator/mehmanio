import { describe, expect, test } from "vitest";
import {
  activeToolsForAction,
  normalizeToolName,
  primaryToolForAction,
  toolChoiceForStep,
} from "./policy";

const miraTools = [
  "search_properties",
  "check_availability",
  "get_room_details",
  "calculate_price",
  "get_policy",
  "create_booking_hold",
  "confirm_booking_hold",
  "list_addons",
] as const;

describe("primaryToolForAction", () => {
  test("search forces search_properties", () => {
    expect(primaryToolForAction("search", false)).toBe("search_properties");
  });

  test("price forces calculate_price", () => {
    expect(primaryToolForAction("price", false)).toBe("calculate_price");
  });

  test("hold without an existing hold forces create_booking_hold", () => {
    expect(primaryToolForAction("hold", false)).toBe("create_booking_hold");
  });

  test("hold after a hold exists confirms that hold, and does not re-check availability", () => {
    expect(primaryToolForAction("hold", true)).toBe("confirm_booking_hold");
    expect(activeToolsForAction("hold", true)).toEqual(["confirm_booking_hold"]);
  });

  test("naming a different room while held moves the lock instead of confirming the old one", () => {
    expect(primaryToolForAction("hold", true, true)).toBe("create_booking_hold");
  });

  test("ask does not send tools", () => {
    expect(primaryToolForAction("ask", false)).toBeNull();
  });
});

describe("toolChoiceForStep", () => {
  test("step 0 of a search forces the registered name, not functions/…", () => {
    expect(toolChoiceForStep("search", 0, false)).toEqual({
      type: "tool",
      toolName: "search_properties",
    });
  });

  test("later steps allow auto so the model can price or hold next", () => {
    expect(toolChoiceForStep("search", 1, false)).toBe("auto");
  });

  test("confirming an existing hold forces confirm_booking_hold", () => {
    expect(toolChoiceForStep("hold", 0, true)).toEqual({
      type: "tool",
      toolName: "confirm_booking_hold",
    });
  });
});

describe("activeToolsForAction", () => {
  test("search does not dump every tool on the first call", () => {
    const active = activeToolsForAction("search", false);
    expect(active[0]).toBe("search_properties");
    expect(active).not.toContain("create_booking_hold");
    expect(active.length).toBeLessThan(miraTools.length);
  });

  test("hold can still price first", () => {
    expect(activeToolsForAction("hold", false)).toEqual(
      expect.arrayContaining(["create_booking_hold", "calculate_price"]),
    );
  });
});

describe("normalizeToolName", () => {
  test("strips Groq/Qwen functions/ prefix onto a registered tool", () => {
    expect(normalizeToolName("functions/check_availability", miraTools)).toBe(
      "check_availability",
    );
  });

  test("leaves unknown names as null", () => {
    expect(normalizeToolName("functions/json", miraTools)).toBeNull();
  });
});
