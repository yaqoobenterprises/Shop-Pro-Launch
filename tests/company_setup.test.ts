import { afterEach, describe, expect, it, vi } from "vitest";
import * as supabase from "../src/lib/supabase";
import { sqliteRepository } from "../src/services/sqliteRepository";
import { prepareCompanySetup } from "../src/lib/companySetupValidation";
import { saveFirstRunCompanySetup } from "../src/services/companySetupService";
import type { Organization } from "../src/types";

const company: Organization = {
  id: "company-a", name: "Sample", owner_name: "Owner", currency: "PKR",
  currency_symbol: "Rs", country: "Pakistan", timezone: "Asia/Karachi",
  business_category: "", tax_rate: 0, tax_enabled: false,
  invoice_prefix: "SP-", next_invoice_number: 1001,
  created_at: "2026-11-20T00:00:00Z",
};
const input = {
  name: "New Company", businessCategory: "Services",
  currency: "PKR", country: "Pakistan", timezone: "Asia/Karachi",
};
const request = {
  userId: "owner-a", organization: company, isCloudAccount: true, input,
};

function fakeClient(role = "OWNER", updateRow: Record<string, unknown> | null = {
  id: company.id, name: "New Company", business_category: "Services",
  currency: "PKR", currency_symbol: "Rs", country: "Pakistan",
  timezone: "Asia/Karachi", region_configured: true,
}) {
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: updateRow, error: null }),
      }),
    }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "organization_members") return {
      select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({
          data: { role, is_active: true }, error: null,
        }),
      }) }) }),
    };
    if (table === "organizations") return { update };
    throw new Error("Unexpected query " + table);
  });
  return { from, update };
}

describe("company setup validation and server confirmation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects malformed names, country, currency and timezone", () => {
    expect(() => prepareCompanySetup({ ...input, name: " " })).toThrow(/company name/i);
    expect(() => prepareCompanySetup({ ...input, currency: "JPY" })).toThrow(/supported currency/i);
    expect(() => prepareCompanySetup({ ...input, timezone: "Wrong/Timezone" })).toThrow(/timezone/i);
    expect(() => prepareCompanySetup({ ...input, country: "" })).toThrow(/country/i);
    expect(prepareCompanySetup(input)).toMatchObject({
      name: "New Company", currency: "PKR", region_configured: true,
    });
  });

  it("blocks unverified cloud sessions before any company SQL writes", async () => {
    vi.spyOn(supabase, "hasConfiguredCloudSession").mockResolvedValue(false);
    const client = fakeClient();
    vi.spyOn(supabase, "getSupabaseClient").mockReturnValue(client as never);
    await expect(saveFirstRunCompanySetup(request)).rejects.toThrow(/cloud session/i);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects non-owner membership even when the UI sends an owner request", async () => {
    vi.spyOn(supabase, "hasConfiguredCloudSession").mockResolvedValue(true);
    const client = fakeClient("CASHIER");
    vi.spyOn(supabase, "getSupabaseClient").mockReturnValue(client as never);
    await expect(saveFirstRunCompanySetup(request)).rejects.toThrow(/only an active company owner/i);
    expect(client.update).not.toHaveBeenCalled();
  });

  it("rejects a successful HTTP response that updated zero rows", async () => {
    vi.spyOn(supabase, "hasConfiguredCloudSession").mockResolvedValue(true);
    const client = fakeClient("OWNER", null);
    vi.spyOn(supabase, "getSupabaseClient").mockReturnValue(client as never);
    await expect(saveFirstRunCompanySetup(request)).rejects.toThrow(/not confirmed/i);
  });

  it("saves only existing company fields after verified owner and row receipt", async () => {
    vi.spyOn(supabase, "hasConfiguredCloudSession").mockResolvedValue(true);
    const client = fakeClient();
    vi.spyOn(supabase, "getSupabaseClient").mockReturnValue(client as never);
    await expect(saveFirstRunCompanySetup(request)).resolves.toMatchObject({
      name: "New Company", business_category: "Services", region_configured: true,
    });
    expect(client.update).toHaveBeenCalledTimes(1);
    expect(client.update.mock.calls[0][0]).not.toHaveProperty("opening_balance");
    expect(client.update.mock.calls[0][0]).not.toHaveProperty("tax_enabled");
  });

  it("does not relabel an existing local book's financial currency", async () => {
    vi.spyOn(sqliteRepository, "updateOrganization").mockResolvedValue(undefined);
    await expect(saveFirstRunCompanySetup({
      ...request, isCloudAccount: false, input: { ...input, currency: "USD" },
    })).rejects.toThrow(/accounting review/i);
    expect(sqliteRepository.updateOrganization).not.toHaveBeenCalled();
  });
});
