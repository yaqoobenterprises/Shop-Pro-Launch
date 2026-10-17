import { describe, expect, it, vi } from "vitest";
import { activateProfileAfterPinUnlock } from "../src/lib/authSession";

describe("cloud session restoration after PIN unlock", () => {
  const profile = { id: "user-1" };
  const organization = { id: "shop-1" };

  it("reactivates a matching cloud account when its Supabase session still exists", async () => {
    const hasMatchingSession = vi.fn().mockResolvedValue(true);
    const activateSession = vi.fn().mockResolvedValue("ready");
    const activateLocally = vi.fn();

    await expect(
      activateProfileAfterPinUnlock(profile, organization, hasMatchingSession, activateSession, activateLocally),
    ).resolves.toBe(true);
    expect(hasMatchingSession).toHaveBeenCalledWith("user-1");
    expect(activateSession).toHaveBeenCalledWith("user-1");
    expect(activateLocally).not.toHaveBeenCalled();
  });

  it("keeps PIN unlock local when there is no matching Supabase session", async () => {
    const hasMatchingSession = vi.fn().mockResolvedValue(false);
    const activateSession = vi.fn();
    const activateLocally = vi.fn();

    await expect(
      activateProfileAfterPinUnlock(profile, organization, hasMatchingSession, activateSession, activateLocally),
    ).resolves.toBe(true);
    expect(activateSession).not.toHaveBeenCalled();
    expect(activateLocally).toHaveBeenCalledWith(profile, organization);
  });

  it("does not finish PIN unlock while an authenticator challenge is required", async () => {
    const hasMatchingSession = vi.fn().mockResolvedValue(true);
    const activateSession = vi.fn().mockResolvedValue("mfa_required");
    const activateLocally = vi.fn();

    await expect(
      activateProfileAfterPinUnlock(profile, organization, hasMatchingSession, activateSession, activateLocally),
    ).resolves.toBe(false);
    expect(activateLocally).not.toHaveBeenCalled();
  });
});
