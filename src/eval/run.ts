import { calculatePrice } from "../lib/inventory";
import { createDb } from "../db/client";
import { seedCatalog } from "../db/seed";
import { play, scenarios } from "./scenarios";

type Score = { id: string; title: string; pass: boolean; notes: string[] };

async function scoreOne(id: (typeof scenarios)[number]["id"]): Promise<Score> {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(id);
  const played = await play(scenario.turns);
  const notes: string[] = [];
  const { expect } = scenario;
  const { state, lastSearch, lastDetails } = played;

  if (expect.destination && state.destination !== expect.destination) {
    notes.push(`destination ${state.destination} != ${expect.destination}`);
  }
  if (expect.adults != null && state.adults !== expect.adults) {
    notes.push(`adults ${state.adults} != ${expect.adults}`);
  }
  if (expect.children != null && state.children !== expect.children) {
    notes.push(`children ${state.children} != ${expect.children}`);
  }
  if (expect.checkIn && state.checkIn !== expect.checkIn) {
    notes.push(`checkIn ${state.checkIn} != ${expect.checkIn}`);
  }
  if (expect.checkOut && state.checkOut !== expect.checkOut) {
    notes.push(`checkOut ${state.checkOut} != ${expect.checkOut}`);
  }
  if (expect.topRoom && lastSearch?.matches[0]?.roomId !== expect.topRoom) {
    notes.push(`top ${lastSearch?.matches[0]?.roomId} != ${expect.topRoom}`);
  }
  if (expect.notTopRoom && lastSearch?.matches[0]?.roomId === expect.notTopRoom) {
    notes.push(`top should not be ${expect.notTopRoom}`);
  }
  if (expect.rejectDouble) {
    const rejected = lastSearch?.rejected.some((room) => room.roomId === "palolem-double");
    if (!rejected) notes.push("double room was not capacity-rejected");
  }
  if (expect.unknownHeated) {
    if (!lastDetails?.unknownFacts.includes("heated_pool")) {
      notes.push("heated_pool was not marked unknown");
    }
  }
  if (expect.nextAction && state.nextAction !== expect.nextAction) {
    notes.push(`nextAction ${state.nextAction} != ${expect.nextAction}`);
  }
  if (scenario.id === "price-matches-tool" && lastSearch?.matches[0] && state.checkIn && state.checkOut) {
    const db = createDb(":memory:");
    await seedCatalog(db);
    const quote = await calculatePrice(db, {
      roomId: lastSearch.matches[0].roomId,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      adults: state.adults,
      children: state.children,
    });
    if (!quote.ok) notes.push(quote.error);
    else if (quote.nightlyRate !== lastSearch.matches[0].nightlyRate) {
      notes.push("nightly rate drifted from catalog");
    }
  }

  return { id: scenario.id, title: scenario.title, pass: notes.length === 0, notes };
}

async function main() {
  const results: Score[] = [];
  for (const scenario of scenarios) {
    results.push(await scoreOne(scenario.id));
  }

  const failed = results.filter((item) => !item.pass);
  for (const item of results) {
    const mark = item.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${item.id}  ${item.title}`);
    for (const note of item.notes) console.log(`      ${note}`);
  }
  console.log(
    `\n${results.length - failed.length}/${results.length} passed (deterministic extract+tools+state)`,
  );
  if (failed.length > 0) process.exit(1);
}

void main();
