import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupDemoWorkspace,
  cleanupDemoWorkspace,
  isDemoSessionActive,
  DEMO_ORG,
  DEMO_USER,
} from "../src/services/demoModeService";
import { getOfflineQueue } from "../src/services/offlineQueue";

describe("Guest Demo Sandbox Isolation & Workspace Lifecycle", () => {
  beforeEach(async () => {
    await cleanupDemoWorkspace();
    localStorage.clear();
  });

  afterEach(async () => {
    await cleanupDemoWorkspace();
    localStorage.clear();
  });

  it("isDemoSessionActive returns false when demo is not initiated", () => {
    expect(isDemoSessionActive()).toBe(false);
  });

  it("setupDemoWorkspace seeds isolated demo data correctly", async () => {
    const demoData = await setupDemoWorkspace();

    expect(isDemoSessionActive()).toBe(true);
    expect(demoData.organization.id).toBe(DEMO_ORG.id);
    expect(demoData.organization.name).toContain("Demo");
    expect(demoData.user.id).toBe(DEMO_USER.id);
    expect(demoData.user.role).toBe("OWNER");

    // Accounts seeded
    expect(demoData.accounts.length).toBe(3);
    const accountNames = demoData.accounts.map((a) => a.name);
    expect(accountNames).toContain("Cash Drawer");
    expect(accountNames).toContain("Meezan Bank (Shop Acct)");
    expect(accountNames).toContain("JazzCash Merchant");

    // Transactions seeded
    expect(demoData.transactions.length).toBe(4);
    const totalIncome = demoData.transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amountPaisa, 0);
    expect(totalIncome).toBeGreaterThan(0);

    // Verify localStorage has demo items
    expect(localStorage.getItem("yaqoob_demo_mode")).toBe("true");
    expect(localStorage.getItem("yaqoob_demo_accounts")).toBeTruthy();
    expect(localStorage.getItem("yaqoob_demo_transactions")).toBeTruthy();
  });

  it("serializes overlapping workspace setup without duplicating sample entries", async () => {
    await Promise.all([setupDemoWorkspace(), setupDemoWorkspace()]);
    const queuedDemoTransactions = (await getOfflineQueue()).filter(
      (transaction) => transaction.organizationId === DEMO_ORG.id,
    );

    expect(queuedDemoTransactions).toHaveLength(4);
    expect(new Set(queuedDemoTransactions.map((transaction) => transaction.id)).size).toBe(4);
  });

  it("cleanupDemoWorkspace thoroughly purges demo state without residual keys", async () => {
    await setupDemoWorkspace();
    expect(isDemoSessionActive()).toBe(true);

    await cleanupDemoWorkspace();

    expect(isDemoSessionActive()).toBe(false);
    expect(localStorage.getItem("yaqoob_demo_mode")).toBeNull();
    expect(localStorage.getItem("yaqoob_demo_accounts")).toBeNull();
    expect(localStorage.getItem("yaqoob_demo_transactions")).toBeNull();
  });
});
