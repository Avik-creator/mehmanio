# Engineering note

Mira is a single Next.js app. pnpm is the package manager. Vitest and `tsx` run the tests and seed/eval scripts. Groq is called through the Vercel AI SDK. There is no second backend and no agent framework.

Inventory is a SQLite file via Drizzle + `better-sqlite3` on Node. Bun was dropped as the runtime because Next 16 Turbopack under `bun --bun` rewrites externals to hashed names (`drizzle-orm-<hash>`) that Bun cannot resolve, and `better-sqlite3` also panic-crashed Bun’s test runner.

**Model.** `llama-3.3-70b-versatile` on Groq. It is fast enough that we do not stream, which makes tool traces honest, and it actually calls tools. Smaller Groq models on this desk skipped tools in earlier checks. The model is an env var.

**Flow.** Each turn is extract → merge → policy → tools → speak. Extract is structured output (`Output.object` + Zod). If Groq is missing or the schema fails, a small heuristic extract still understands the assignment sentences so the desk does not go blank. Merge is TypeScript: “4 people and stay till the 13th” patches adults and checkout; it does not clear Goa. Policy will not search without destination, dates, and a party. When those exist, Groq chooses among real tools.

**State.** `BookingState` is JSON in SQLite keyed by `sessionId`. The inspector reads that object, not chain of thought.

**Tools.** Inventory, availability (minus unexpired holds), room details, policy, add-ons, and a 15-minute hold are queries. `search_properties` ranks in code (destination, capacity, privacy, amenities, budget). `calculate_price` is the only source of money: nights × rate + extra adults + add-ons + 12% tax.

**Hallucination.** Speak is instructed to use tool JSON only. After the reply, any ₹ / 4+ digit number that is not in state or tool results is stripped and logged on the inspector. Unknown amenities (`heated_pool`) are a first-class `unknownFacts` field — the catalog simply does not have the column.

**Tradeoffs.** A free ReAct loop would have been less code and would invent ADR. LangGraph would have been more ceremony than three properties need. Streaming would look nicer and make traces racy. Frozen `MIRA_TODAY` makes the demo reproducible and is wrong as a production clock.

**Next.** Wire a real PMS and payments; carry the same `BookingState` onto WhatsApp; add eval that greps live Groq traces for tool names, not only the deterministic pipeline.
