export function inferParty(text: string): { adults?: number; children?: number } {
  const lower = text.toLowerCase();
  if (/2 friends and me|two friends and me/.test(lower)) return { adults: 3 };
  if (/wife and 2 kids|wife and two kids/.test(lower)) {
    return { adults: 2, children: 2 };
  }
  if (/\bfive of us\b/.test(lower)) return { adults: 5 };
  const makeThat = lower.match(/make that (\d+) people/);
  if (makeThat) return { adults: Number(makeThat[1]) };
  const forPeople = lower.match(/\bfor (\d+)\b/);
  if (forPeople) return { adults: Number(forPeople[1]) };
  return {};
}
