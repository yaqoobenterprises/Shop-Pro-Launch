import { afterEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
}));

import { sendLedgerMateMessage } from "../src/services/ledgerMateAiService";

describe("LedgerMate streaming client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getSession.mockReset();
  });

  it("treats the server's done event as successful stream completion", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"delta":"Rs 530.00"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"model":"openai/gpt-oss-20b"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    })));
    const deltas: string[] = [];

    await expect(sendLedgerMateMessage(
      [{ role: "user", content: "Aaj ki sale?" }],
      "Verified sales: Rs 530.00",
      (delta) => deltas.push(delta),
    )).resolves.toEqual({ reply: "Rs 530.00", model: "openai/gpt-oss-20b" });
    expect(deltas).toEqual(["Rs 530.00"]);
  });
});
