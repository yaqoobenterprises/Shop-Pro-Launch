import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/context/AppContext", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("../src/services/aiAccountantChatService", async original => ({
  ...await original<typeof import("../src/services/aiAccountantChatService")>(),
  listSyncedAiAccountantConversations: vi.fn(), createSyncedAiAccountantConversation: vi.fn(),
  loadSyncedAiAccountantHistory: vi.fn(), appendSyncedAiAccountantMessage: vi.fn(), clearSyncedAiAccountantHistory: vi.fn(),
}));
import * as remote from "../src/services/aiAccountantChatService";
import { useLedgerMateChatHistory } from "../src/services/useLedgerMateChatHistory";
const scope = { userId: "user-a", organizationId: "shop-a", isCloudAccount: true };
const thread = { id: "cloud-a", title: "Earlier chat", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" };
const stored = { role: "user" as const, content: "Earlier question", createdAt: "2026-11-01T00:00:00Z" };
const mock = vi.mocked(remote);
beforeEach(() => {
  vi.clearAllMocks();
  mock.listSyncedAiAccountantConversations.mockResolvedValue([thread]);
  mock.loadSyncedAiAccountantHistory.mockResolvedValue({ conversationId: thread.id, messages: [stored] });
  mock.createSyncedAiAccountantConversation.mockResolvedValue({ ...thread, id: "new-cloud" });
  mock.appendSyncedAiAccountantMessage.mockResolvedValue("message-id");
});
describe("LedgerMate conversation lifecycle", () => {
  it("starts fresh and keeps earlier conversations available without auto-loading one", async () => {
    localStorage.setItem("shop-pro.ledgermate.v1.shop-a.user-a.threads", JSON.stringify([thread]));
    localStorage.setItem("shop-pro.ledgermate.v1.shop-a.user-a.cloud-a", JSON.stringify([stored]));
    const { result } = renderHook(() => useLedgerMateChatHistory(scope));
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.activeThreadId).toBeNull(); expect(result.current.messages).toEqual([]);
    expect(mock.loadSyncedAiAccountantHistory).not.toHaveBeenCalled();
    expect(mock.createSyncedAiAccountantConversation).not.toHaveBeenCalled();
    await act(() => result.current.activateThread(thread));
    expect(result.current.messages[0].content).toBe("Earlier question");
    await act(() => result.current.createThread());
    expect(result.current.messages).toEqual([]); expect(result.current.activeThreadId).toBeNull();
    expect(result.current.threads).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("shop-pro.ledgermate.v1.shop-a.user-a.cloud-a")!)[0].content).toBe("Earlier question");
  });
  it("ignores a delayed old history response after New chat", async () => {
    let resolve!: (value: remote.SyncedAiAccountantHistory) => void;
    mock.loadSyncedAiAccountantHistory.mockReturnValue(new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => useLedgerMateChatHistory(scope));
    let pending!: Promise<void>;
    act(() => { pending = result.current.activateThread(thread); });
    await act(() => result.current.createThread());
    await act(async () => { resolve({ conversationId: thread.id, messages: [stored] }); await pending; });
    expect(result.current.activeThreadId).toBeNull(); expect(result.current.messages).toEqual([]);
  });
  it("creates one conversation on the first message and keeps follow-ups in that conversation", async () => {
    const { result } = renderHook(() => useLedgerMateChatHistory(scope));
    await act(() => result.current.syncMessage({ role: "user", content: "Today's activity", createdAt: "2026-11-28T10:00:00Z" }));
    await act(() => result.current.syncMessage({ role: "assistant", content: "Recorded activity", createdAt: "2026-11-28T10:00:01Z" }));
    expect(mock.createSyncedAiAccountantConversation).toHaveBeenCalledOnce();
    expect(mock.appendSyncedAiAccountantMessage).toHaveBeenCalledTimes(2);
    expect(mock.appendSyncedAiAccountantMessage.mock.calls.every(call => call[1] === "new-cloud")).toBe(true);
  });
  it("does not expose another account's conversations when the scope changes", async () => {
    let resolve!: (value: remote.AiAccountantConversation[]) => void;
    mock.listSyncedAiAccountantConversations.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce([]);
    const { result, rerender } = renderHook(props => useLedgerMateChatHistory(props), { initialProps: scope });
    rerender({ ...scope, userId: "user-b", organizationId: "shop-b" });
    await act(async () => { resolve([thread]); });
    expect(result.current.threads).toEqual([]); expect(result.current.messages).toEqual([]);
  });
});
