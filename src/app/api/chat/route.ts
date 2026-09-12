import { runTurn } from "@/lib/agent/orchestrator";
import { readyDb } from "@/db/ready";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    message?: string;
  };
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();
  if (!sessionId || !message) {
    return Response.json(
      { error: "sessionId and message are required" },
      { status: 400 },
    );
  }

  try {
    const db = await readyDb();
    const turn = await runTurn({ db, sessionId, message });
    return Response.json(turn);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "turn failed",
      },
      { status: 500 },
    );
  }
}
