"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MiraMarkdown } from "@/components/MiraMarkdown";
import type { AgentTurn, BookingState, NextAction, ToolTrace } from "@/lib/types";
import { emptyBookingState } from "@/lib/state";

type ChatLine = { id: string; role: "guest" | "mira"; text: string };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function guestLine(state: BookingState): string {
  const people = state.adults + state.children;
  if (people < 1) return "—";
  const kids = state.children ? `, ${state.children} kids` : "";
  return `${people} (${state.adults} adults${kids})`;
}

function budgetLine(state: BookingState): string {
  if (state.budgetPerNight == null) return "—";
  return `₹${state.budgetPerNight.toLocaleString("en-IN")}/night`;
}

function resultLine(traces: ToolTrace[]): string {
  const search = [...traces].reverse().find((trace) => trace.name === "search_properties");
  if (search && typeof search.result === "object" && search.result && "matches" in search.result) {
    const matches = (search.result as { matches: unknown[] }).matches;
    return `${matches.length} matching room${matches.length === 1 ? "" : "s"}`;
  }
  const price = [...traces].reverse().find((trace) => trace.name === "calculate_price");
  if (price && typeof price.result === "object" && price.result && "total" in price.result) {
    const total = (price.result as { total?: number }).total;
    return total != null ? `quoted ₹${total.toLocaleString("en-IN")}` : "priced";
  }
  if (traces[0]) return traces[traces.length - 1].name;
  return "—";
}

function nextLine(state: BookingState, action: NextAction): string {
  if (action === "recommend" && state.lastRecommendations[0]) {
    return `Recommend ${state.lastRecommendations[0].reason}`;
  }
  return action;
}

const GUEST_SESSION_KEY = "mira-session-id";

function readGuestSessionId(): string {
  const fromLocal = localStorage.getItem(GUEST_SESSION_KEY);
  if (fromLocal) return fromLocal;
  const legacy = sessionStorage.getItem("mira-session");
  if (legacy) {
    localStorage.setItem(GUEST_SESSION_KEY, legacy);
    return legacy;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(GUEST_SESSION_KEY, id);
  return id;
}

export function MiraDesk() {
  const [sessionId, setSessionId] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [pending, setPending] = useState(false);
  const [turn, setTurn] = useState<AgentTurn | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(readGuestSessionId());
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setSessionReady(false);
    void (async () => {
      try {
        const response = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          state?: BookingState;
          today?: string;
          messages?: ChatLine[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setFatal(payload.error ?? "Could not restore this guest session");
          return;
        }
        setLines(payload.messages ?? []);
        if (payload.state) {
          setTurn({
            reply:
              payload.messages?.filter((line) => line.role === "mira").at(-1)?.text ?? "",
            state: payload.state,
            traces: [],
            nextAction: payload.state.nextAction,
            errors: [],
            today: payload.today ?? "2026-09-12",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFatal(
            error instanceof Error ? error.message : "Could not restore this guest session",
          );
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines, pending]);

  const state = turn?.state ?? emptyBookingState();

  const inspector = useMemo(
    () => ({
      destination: state.destination ?? "—",
      dates:
        state.checkIn && state.checkOut
          ? `${formatDate(state.checkIn)} to ${formatDate(state.checkOut)}`
          : "—",
      guests: guestLine(state),
      budget: budgetLine(state),
      action: turn?.traces[turn.traces.length - 1]?.name ?? turn?.nextAction ?? "—",
      result: resultLine(turn?.traces ?? []),
      next: nextLine(state, turn?.nextAction ?? state.nextAction),
    }),
    [state, turn],
  );

  async function send(text: string) {
    if (!text.trim() || !sessionId || !sessionReady || pending) return;
    setPending(true);
    setFatal(null);
    setInput("");
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "guest", text },
    ]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const payload = (await response.json()) as AgentTurn & { error?: string };
      if (!response.ok) {
        setFatal(payload.error ?? "Request failed");
        return;
      }
      setTurn(payload);
      setLines((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "mira", text: payload.reply },
      ]);
    } catch (error) {
      setFatal(error instanceof Error ? error.message : "network error");
    } finally {
      setPending(false);
    }
  }

  async function reset() {
    if (!sessionId) return;
    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const id = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, id);
    sessionStorage.removeItem("mira-session");
    setSessionId(id);
    setLines([]);
    setTurn(null);
    setFatal(null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f3eee4] text-[#1c1917]">
      <header className="flex items-center justify-between border-b border-[#e0d6c6] px-6 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#7a6a55]">
            Mehman · guest layer
          </p>
          <h1 className="font-serif text-2xl tracking-tight">Mira</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            title="Pinned clock so relative dates like next weekend are demoable."
            className="rounded-full bg-[#1f4d3a] px-3 py-1 text-xs text-[#f6f1e8]"
          >
            Desk date {turn?.today ?? "2026-09-12"}
          </span>
          <button
            type="button"
            onClick={reset}
            title="Start a new guest thread without reloading the app."
            className="rounded-full border border-[#cbbba3] px-3 py-1 text-xs hover:bg-white"
          >
            New guest
          </button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <section
          className="flex min-h-[28rem] flex-col border-r border-[#e0d6c6] bg-[#faf6ee]"
          title="Guest-facing conversation. No booking form — Mira has to ask."
        >
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
            {lines.length === 0 && (
              <p className="max-w-md text-sm leading-6 text-[#6f6253]">
                Write the way a guest would on WhatsApp. Try: looking for something
                in Goa this weekend for my 2 friends and me. Something private
                would be nice.
              </p>
            )}
            {lines.map((line) => (
              <div
                key={line.id}
                className={
                  line.role === "guest"
                    ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-[#1f4d3a] px-4 py-3 text-sm leading-6 text-[#f6f1e8]"
                    : "max-w-[min(100%,42rem)] overflow-x-auto rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-sm leading-6 shadow-sm"
                }
              >
                {line.role === "mira" ? (
                  <MiraMarkdown text={line.text} />
                ) : (
                  line.text
                )}
              </div>
            ))}
            {pending && (
              <p className="text-xs uppercase tracking-widest text-[#9a8b76]">
                Mira is checking the listing…
              </p>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-[#e0d6c6] bg-[#f3eee4] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Message Mira"
              className="flex-1 rounded-full border border-[#d7cbb8] bg-white px-4 py-3 text-sm outline-none focus:border-[#1f4d3a]"
            />
            <button
              type="submit"
              disabled={!sessionReady || pending}
              className="rounded-full bg-[#1f4d3a] px-5 py-3 text-sm text-[#f6f1e8] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

        <aside
          className="flex flex-col bg-[#171a19] text-[#e8e4dc]"
          title="Operator inspector. Structured traces, not chain of thought."
        >
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#c4a574]">
              Revenue desk
            </p>
            <p className="text-sm text-[#b7b1a6]">What Mira currently believes.</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-[#8f8a80]">Session</dt>
            <dd className="font-mono text-xs" title={sessionId}>
              {sessionId ? `${sessionId.slice(0, 8)}…` : "—"}
            </dd>
            <dt className="text-[#8f8a80]">Hold</dt>
            <dd className="font-mono text-xs">
              {state.bookingHoldId ? state.bookingHoldId.slice(0, 18) : "—"}
            </dd>
            <dt className="text-[#8f8a80]">Destination</dt>
            <dd>{inspector.destination}</dd>
            <dt className="text-[#8f8a80]">Dates</dt>
            <dd>{inspector.dates}</dd>
            <dt className="text-[#8f8a80]">Guests</dt>
            <dd>{inspector.guests}</dd>
            <dt className="text-[#8f8a80]">Budget</dt>
            <dd>{inspector.budget}</dd>
            <dt className="text-[#8f8a80]">Action</dt>
            <dd className="font-mono text-xs">{inspector.action}</dd>
            <dt className="text-[#8f8a80]">Result</dt>
            <dd>{inspector.result}</dd>
            <dt className="text-[#8f8a80]">Next</dt>
            <dd>{inspector.next}</dd>
          </dl>
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#c4a574]">
              Tool calls
            </p>
            <div className="space-y-2">
              {(turn?.traces ?? []).length === 0 && (
                <p className="text-xs text-[#8f8a80]">No tools this turn.</p>
              )}
              {(turn?.traces ?? []).map((trace, index) => (
                <details
                  key={`${trace.name}-${index}`}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <summary className="cursor-pointer font-mono text-xs">
                    {trace.name}
                    {trace.error ? ` · ${trace.error}` : ""}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-5 text-[#cfc8bb]">
                    {JSON.stringify({ args: trace.args, result: trace.result }, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
            {(turn?.errors.length || fatal) && (
              <div className="mt-4 rounded-lg border border-red-400/40 bg-red-950/40 p-3 text-xs text-red-100">
                {fatal}
                {(turn?.errors ?? []).map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="border-t border-[#e0d6c6] px-6 py-3 text-center text-[11px] text-[#8a7d6b]">
        Mira take-home · generated with Cursor Grok 4.6
      </footer>
    </div>
  );
}
