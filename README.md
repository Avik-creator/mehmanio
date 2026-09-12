# Mira

A simplified guest-facing booking agent for [Mehman](https://www.mehman.io) — an AI revenue desk for hospitality that qualifies inquiries, recommends a stay, and moves the guest toward a booking.

This repo is the **web slice of Mira**: one conversation, a small SQLite inventory, Groq tool calling via the Vercel AI SDK, and an operator inspector so you can see state, tools, and next action. It is not WhatsApp, Instagram, or phone, and it does not take payment.

## Why the UI looks like this

- **Left thread** is the guest surface. No destination/date form. Mira has to earn the slots from chat, the way a WhatsApp inquiry works.
- **Right inspector** is the revenue desk. Mehman grades whether the agent updates state, calls tools, and stays grounded — not private chain of thought.
- **Desk date chip** pins “today” at 12 Sep 2026 so “this weekend” / “next weekend” are demoable.
- **New guest** starts a new `sessionId` without a reload.
- **Footer watermark** marks this take-home build.

## Setup

Needs [pnpm](https://pnpm.io) 9+ and a [Groq](https://console.groq.com) API key.

```bash
pnpm install
cp .env.example .env.local
# put GROQ_API_KEY in .env.local
pnpm db:seed
pnpm test
pnpm eval
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

pnpm is the package manager. Next.js and the SQLite driver run on Node.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | — | Required for the live model. Extract falls back to heuristics if missing; the inspector shows the error. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model with tool calling. Smaller Groq models often skip tools. |
| `MIRA_TODAY` | `2026-09-12` | Clock for relative dates (IST calendar dates). |
| `MIRA_DB_PATH` | `data/mira.db` | SQLite file. |

## Architecture

Guest message → extract slot **deltas** → merge into `BookingState` → decide ask vs tools → Groq may call tools → validate against SQLite → grounded reply → 15-minute hold.

Application code owns dates, merge, ranking, availability, and price. The model does not.

```
src/lib/dates.ts                 relative dates
src/lib/state.ts                 merge without restarting
src/lib/inventory.ts             tool implementations + ranking
src/lib/agent/orchestrator.ts    extract → merge → tools → speak
src/db/schema.ts                 SQLite via Drizzle + better-sqlite3
```

Tools: `search_properties`, `check_availability`, `get_room_details`, `calculate_price`, `get_policy`, `create_booking_hold`, `list_addons`.

Prices: `nights × rate + extra adults + add-ons + 12% tax`. Never LLM arithmetic.

A hold is a `booking_holds` row with `expiresAt = now + 15 minutes`. Availability subtracts unexpired holds. There is no background timer.

See [ENGINEERING.md](./ENGINEERING.md) for the one-page note.

## Inventory

Three fictional properties:

- **Casa Anjuna**, North Goa — private pool villa (sold out 18–19 Sep 2026), garden suite, sea-view double
- **Palolem House**, South Goa — family cottage (fits five), double (max two), palm studio
- **Alibaug Cliff Stay** — not Goa, so a Goa search cannot return it

There is a pool amenity. There is **no** heated-pool fact.

## Assumptions

- “Under 20k” is INR **per night for the room**, not per person, unless the guest says total.
- From Sat 12 Sep 2026, **this weekend** = 12–14 Sep. **Next weekend** = Fri 18–Sun 20 Sep.
- “2 friends and me” = 3 adults. “Wife and 2 kids” = 2 adults + 2 children.
- A 15-minute hold is not a confirmed booking and not a payment.

## 5-minute demo

No slides. Use the running app with the inspector visible.

1. **Happy path.** “Looking for something in Goa this weekend for my 2 friends and me. Something private would be nice.” State should show Goa, 12–14 Sep, 3 adults. Tools should search. Next: Private Pool Villa. Ask Mira to price it, then “yes” for a hold.
2. **Edge: change of requirements.** “Actually make that 4 people and stay till the 13th.” Destination stays Goa. Guests become 4. Checkout becomes 13 Sep.
3. **Edge: no availability.** New guest: “Private pool villa in Goa next weekend for 3, under 20k.” Villa is sold out 18–19 Sep. Mira must not invent a vacancy; it should offer Garden Suite (or similar) and say why.

Also worth 30 seconds: “Is the pool heated?” → unknown, not yes.

## Tests and eval

```bash
pnpm test          # dates, merge, ranking, price, holds, extract
pnpm eval          # 15 scripted conversations, no Groq required
```

Eval scores state updates, ranking, capacity rejection, unknown facts, recovery phrases, and that catalog rates match `calculate_price`.

## Known limitations

- Web only. No WhatsApp / Instagram / voice.
- Holds are SQLite rows with an expiry, not a PMS write or payment.
- Groq can still pick a clumsy tool; merge + `calculate_price` + grounding are the backstop.
- Inventory is SQLite through `better-sqlite3` on Node. That keeps the chat route out of the Next 16 + Bun Turbopack hashed-externals bug.
- Default clock is frozen at 12 Sep 2026 on purpose.
