import { describe, expect, test } from "vitest";
import { inferParty } from "./party";

test("maps common hospitality phrases to a party size", () => {
  expect(inferParty("2 friends and me")).toEqual({ adults: 3 });
  expect(inferParty("wife and 2 kids")).toEqual({ adults: 2, children: 2 });
  expect(inferParty("Five of us in Goa")).toEqual({ adults: 5 });
  expect(inferParty("Need Goa this weekend for 2, private.")).toEqual({ adults: 2 });
});
