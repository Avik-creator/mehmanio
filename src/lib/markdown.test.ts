import { describe, expect, test } from "vitest";
import { unfoldMarkdownTables } from "./markdown";

test("splits a glued five-column inventory table and trailing prose", () => {
  const glued =
    "Here are the available rooms for 3 adults in Goa (Sept 12-14, 2026): | Property | Room | Type | Nightly Rate (INR) | Max Guests | |---|---|---|---|---| | Palolem House – Palolem | **Palm Studio** | Studio | 7,000 | 3 | | Palolem House – Palolem | **Family Cottage** | Cottage | 11,000 | 6 | All can accommodate your party of 3 adults. Which one would you like to hold?";
  const unfolded = unfoldMarkdownTables(glued);
  expect(unfolded).toContain("\n| Property | Room | Type | Nightly Rate (INR) | Max Guests |\n");
  expect(unfolded).toContain("\n|---|---|---|---|---|\n");
  expect(unfolded).toContain("\n| Palolem House – Palolem | **Palm Studio** | Studio | 7,000 | 3 |\n");
  expect(unfolded).toMatch(/\|\n\nAll can accommodate/);
});

test("splits a one-line GFM table into rows", () => {
  const glued =
    "Here are rooms: | Property | Room | |---|---| | Palolem House | Palm Studio |";
  const unfolded = unfoldMarkdownTables(glued);
  expect(unfolded).toContain("\n| Property | Room |\n");
  expect(unfolded).toContain("\n|---|---|\n");
  expect(unfolded).toContain("\n| Palolem House | Palm Studio |");
});
