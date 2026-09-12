export function todayIso(): string {
  return process.env.MIRA_TODAY ?? "2026-09-12";
}

export function nowIso(): string {
  if (process.env.MIRA_NOW) return process.env.MIRA_NOW;
  return new Date().toISOString();
}
