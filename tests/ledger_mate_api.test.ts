import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/ai-chat.js";

function responseStub() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    headersSent: false,
    output: "",
    setHeader(name: string, value: string) { headers[name] = value; },
    write(value: string) { this.output += value; this.headersSent = true; },
    end(value = "") { this.output += value; this.headersSent = true; },
  };
}

const fixtureUser = "11000000-0000-4000-8000-000000000001";
const authResponse = () => Response.json({id:fixtureUser});
const membershipResponse = () => Response.json([{user_id:fixtureUser,is_active:true}]);

function authenticatedFetch(groqResponse?: Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/auth/v1/user")) return authResponse();
    if (String(input).includes("/rest/v1/organization_members?")) return membershipResponse();
    return groqResponse || new Response("provider down", { status: 503 });
  });
}

describe("LedgerMate Groq API boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects invalid sessions before accessing Groq", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "POST", headers: { authorization: "Bearer expired" }, body: { messages: [{ role: "user", content: "Hi" }], context: "" } } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.output).error).toContain("session is invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates chat input before sending a provider request", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "POST", headers: { authorization: "Bearer valid" }, body: { messages: [{ role: "system", content: "bad role" }], context: "" } } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("streams authenticated Groq output and exposes the configured model", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b");
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Rs 1,250.00"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchMock = authenticatedFetch(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "POST", headers: { authorization: "Bearer valid" }, body: { messages: [{ role: "user", content: "Income?" }], context: "verified data" } } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/event-stream");
    expect(res.output).toContain('event: delta\ndata: {"delta":"Rs 1,250.00"}');
    expect(res.output).toContain('event: done\ndata: {"done":true,"model":"openai/gpt-oss-20b"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const providerRequest = fetchMock.mock.calls[2][1] as RequestInit;
    expect((providerRequest.headers as Record<string, string>).Authorization).toBe("Bearer server-only-key");
  });

  it("reports ready only when the configured model is available", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/v1/user")) return authResponse();
    if (String(input).includes("/rest/v1/organization_members?")) return membershipResponse();
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-20b", active: true }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "GET", headers: { authorization: "Bearer valid" } } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.output)).toMatchObject({ status: "ready", model: "openai/gpt-oss-20b", provider: "Groq" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.groq.com/openai/v1/models");
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer server-only-key" });
  });

  it("reports offline when Groq does not list the configured model", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/v1/user")) return authResponse();
    if (String(input).includes("/rest/v1/organization_members?")) return membershipResponse();
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-120b", active: true }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "GET", headers: { authorization: "Bearer valid" } } as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.output).error).toContain("configured model");
  });

  it("returns a clear temporary rate-limit error without claiming a response", async () => {
    vi.stubEnv("SUPABASE_URL", "https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("GROQ_API_KEY", "server-only-key");
    const fetchMock = authenticatedFetch(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = responseStub();

    await handler({ method: "POST", headers: { authorization: "Bearer valid" }, body: { messages: [{ role: "user", content: "Income?" }], context: "verified data" } } as never, res as never);

    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.output).error).toContain("rate limit");
    expect(res.headers["Content-Type"]).toContain("application/json");
  });
  it.each([{rows:[]}, {rows:[{user_id:fixtureUser,is_active:false}]}])("denies provider access without a confirmed active membership", async ({rows}) => {
    vi.stubEnv("SUPABASE_URL","https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY","public-key");
    vi.stubEnv("GROQ_API_KEY","server-only-key");
    const mock = vi.fn(async (input:RequestInfo|URL) => String(input).endsWith("/auth/v1/user") ? authResponse() : Response.json(rows));
    vi.stubGlobal("fetch",mock);
    const res=responseStub();
    await handler({method:"POST",headers:{authorization:"Bearer valid"},body:{messages:[{role:"user",content:"Hello"}],context:""}} as never,res as never);
    expect(res.statusCode).toBe(403);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).toContain("is_active=eq.true");
  });
  it("fails closed when the membership read is unavailable",async()=>{
    vi.stubEnv("SUPABASE_URL","https://tenant.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY","public-key");
    vi.stubEnv("GROQ_API_KEY","server-only-key");
    const mock=vi.fn(async (input:RequestInfo|URL)=>String(input).endsWith("/auth/v1/user")?authResponse():new Response("unavailable",{status:500}));
    vi.stubGlobal("fetch",mock);
    const res=responseStub();
    await handler({method:"GET",headers:{authorization:"Bearer valid"}} as never,res as never);
    expect(res.statusCode).toBe(503);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
