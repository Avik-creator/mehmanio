import type { BookingState } from "./types";
import type { ToolTrace } from "./types";

const MONEY = /(?:₹\s*)?(\d{1,3}(?:,\d{2,3})+|\d{4,})/g;

export function ungroundedNumbers(
  reply: string,
  traces: ToolTrace[],
  state: BookingState,
): string[] {
  const allowed = new Set<string>();
  const blob = JSON.stringify({ traces, state });
  for (const match of blob.matchAll(/\d+/g)) {
    allowed.add(match[0]);
  }
  if (state.budgetPerNight) allowed.add(String(state.budgetPerNight));
  if (state.nights) allowed.add(String(state.nights));
  allowed.add(String(state.adults));
  allowed.add(String(state.children));

  const invented: string[] = [];
  for (const match of reply.matchAll(MONEY)) {
    const digits = match[1].replaceAll(",", "");
    if (!allowed.has(digits) && !allowed.has(match[1])) {
      invented.push(match[0]);
    }
  }
  return invented;
}

export function stripInventedPrices(
  reply: string,
  invented: string[],
): { reply: string; errors: string[] } {
  if (invented.length === 0) return { reply, errors: [] };
  let next = reply;
  for (const token of invented) {
    next = next.replaceAll(token, "[price from listing]");
  }
  return {
    reply: `${next}\n\n(I removed a number that was not in the listing. Ask me to price a specific room.)`,
    errors: invented.map((token) => `ungrounded number ${token}`),
  };
}
