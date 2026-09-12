export type RelativeDatePhrase = "this_weekend" | "next_weekend";

export function parseDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatStayLabel(checkIn: string, checkOut: string): string {
  return `${formatWeekday(checkIn)} check-in → ${formatWeekday(checkOut)} checkout`;
}

function formatWeekday(iso: string): string {
  const date = parseDay(iso);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function addNights(iso: string, nights: number): string {
  const date = parseDay(iso);
  date.setUTCDate(date.getUTCDate() + nights);
  return formatDay(date);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = parseDay(checkIn);
  const end = parseDay(checkOut);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function resolveRelativeDates(
  phrase: RelativeDatePhrase,
  todayIso: string,
): { checkIn: string; checkOut: string } {
  if (phrase === "this_weekend") {
    return { checkIn: todayIso, checkOut: addNights(todayIso, 2) };
  }

  const today = parseDay(todayIso);
  const dayOfWeek = today.getUTCDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  if (daysUntilFriday === 0) {
    daysUntilFriday = 7;
  }

  const checkIn = addNights(todayIso, daysUntilFriday);
  return { checkIn, checkOut: addNights(checkIn, 2) };
}
