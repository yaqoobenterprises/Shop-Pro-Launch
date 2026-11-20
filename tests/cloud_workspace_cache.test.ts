import { describe, expect, it } from "vitest";
import { getSqliteDatabase } from "../src/services/sqliteEngine";
import { cacheVerifiedCloudWorkspace } from "../src/services/cloudWorkspaceCache";
import type { Organization, UserProfile } from "../src/types";

describe("cloud identity cache has no artificial opening balances", () => {
  it("copies verified role without inventing payment accounts or revenue", async () => {
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const org: Organization = {
      id: orgId, name: "New Company", owner_name: "Owner",
      currency: "PKR", currency_symbol: "Rs.", country: "Pakistan",
      timezone: "Asia/Karachi", business_category: "", tax_rate: 0,
      tax_enabled: false, invoice_prefix: "NEW-", next_invoice_number: 1001,
      created_at: new Date().toISOString(),
    };
    const profile: UserProfile = {
      id: userId, email: "new@example.invalid", full_name: "Staff",
      role: "CASHIER", organization_id: orgId, is_active: true,
      created_at: new Date().toISOString(),
    };
    await cacheVerifiedCloudWorkspace(org, profile);
    const db = await getSqliteDatabase();
    expect(await db.select("SELECT id FROM payment_accounts WHERE organization_id = ?", [orgId])).toEqual([]);
    expect(await db.select("SELECT id FROM account_transactions WHERE organization_id = ?", [orgId])).toEqual([]);
    expect(await db.select<{ role: string }>("SELECT role FROM profiles WHERE id = ?", [userId]))
      .toEqual([expect.objectContaining({ role: "CASHIER" })]);
    expect(await db.select<{ role: string }>("SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?", [orgId, userId]))
      .toEqual([expect.objectContaining({ role: "CASHIER" })]);
    await cacheVerifiedCloudWorkspace(org, { ...profile, role: "MANAGER" });
    expect(await db.select<{ role: string }>("SELECT role FROM profiles WHERE id = ?", [userId]))
      .toEqual([expect.objectContaining({ role: "MANAGER" })]);
    expect(await db.select("SELECT id FROM payment_accounts WHERE organization_id = ?", [orgId])).toEqual([]);
  });
});
