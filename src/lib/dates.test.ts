import { describe, expect, test } from "vitest";
import {
  addNights,
  formatStayLabel,
  nightsBetween,
  resolveRelativeDates,
} from "./dates";

const saturday = "2026-09-12";

describe("resolveRelativeDates", () => {
  test("this weekend from Saturday 12 Sep 2026 is check-in 12 Sep, checkout 14 Sep", () => {
    expect(resolveRelativeDates("this_weekend", saturday)).toEqual({
      checkIn: "2026-09-12",
      checkOut: "2026-09-14",
    });
  });

  test("next weekend from Saturday 12 Sep 2026 is Fri 18 to Sun 20 Sep", () => {
    expect(resolveRelativeDates("next_weekend", saturday)).toEqual({
      checkIn: "2026-09-18",
      checkOut: "2026-09-20",
    });
  });
});

describe("nightsBetween", () => {
  test("counts hotel nights exclusive of checkout", () => {
    expect(nightsBetween("2026-09-12", "2026-09-14")).toBe(2);
  });
});

describe("formatStayLabel", () => {
  test("names the real weekdays for 12-14 Sep 2026", () => {
    expect(formatStayLabel("2026-09-12", "2026-09-14")).toBe(
      "Sat 12 Sep 2026 check-in → Mon 14 Sep 2026 checkout",
    );
  });
});

describe("addNights", () => {
  test("extends checkout by one night", () => {
    expect(addNights("2026-09-13", 1)).toBe("2026-09-14");
  });
});
