import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ from: query.from }),
}));

import { getUserPreferences } from "../src/services/userPreferencesService";

describe("user preference defaults", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("navigator", { languages: ["ur-PK"], language: "ur-PK" });
    query.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    query.eq.mockReset().mockImplementation(() => ({ maybeSingle: query.maybeSingle }));
    query.select.mockReset().mockImplementation(() => ({ eq: query.eq }));
    query.from.mockReset().mockImplementation(() => ({ select: query.select }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the first Urdu device language when no preference is saved", async () => {
    await expect(getUserPreferences("user-1")).resolves.toEqual({
      entry_mode: "chat",
      language: "ur",
    });
  });

  it("uses a saved preference instead of the device default", async () => {
    window.localStorage.setItem("shop-pro:ui-lang", "en");

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      entry_mode: "chat",
      language: "en",
    });
  });
});
