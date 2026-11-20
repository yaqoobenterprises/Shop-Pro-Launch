import type { Organization, UserProfile } from "../types";
import { getSqliteDatabase } from "./sqliteEngine";

/** Cache verified cloud identity only; no seed money, inventory or default accounts. */
export async function cacheVerifiedCloudWorkspace(
  organization: Organization,
  profile: UserProfile,
): Promise<void> {
  const db = await getSqliteDatabase();
  const stamped = new Date().toISOString();
  await db.execute("BEGIN");
  try {
    const existingOrganization = await db.select<{ id: string }>(
      "SELECT id FROM organizations WHERE id = ?", [organization.id],
    );
    if (!existingOrganization.length) {
      await db.execute(
        "INSERT INTO organizations (id, name, owner_name, currency, currency_symbol, country, timezone, business_category, tax_rate, tax_enabled, invoice_prefix, next_invoice_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [organization.id, organization.name, organization.owner_name, organization.currency,
          organization.currency_symbol, organization.country, organization.timezone,
          organization.business_category || "", organization.tax_rate || 0,
          organization.tax_enabled ? 1 : 0, organization.invoice_prefix || "SP-",
          organization.next_invoice_number || 1001, organization.created_at, stamped],
      );
    } else {
      await db.execute(
        "UPDATE organizations SET name = ?, owner_name = ?, updated_at = ? WHERE id = ?",
        [organization.name, organization.owner_name, stamped, organization.id],
      );
    }

    const existingProfile = await db.select<{ id: string }>(
      "SELECT id FROM profiles WHERE id = ?", [profile.id],
    );
    if (!existingProfile.length) {
      await db.execute(
        "INSERT INTO profiles (id, email, full_name, role, organization_id, is_active, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [profile.id, profile.email, profile.full_name, profile.role, organization.id,
          1, profile.avatar_url || null, profile.created_at, stamped],
      );
    } else {
      await db.execute(
        "UPDATE profiles SET email = ?, full_name = ?, role = ?, organization_id = ?, is_active = ?, updated_at = ? WHERE id = ?",
        [profile.email, profile.full_name, profile.role, organization.id, 1, stamped, profile.id],
      );
    }

    const members = await db.select<{ id: string }>(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organization.id, profile.id],
    );
    if (!members.length) {
      await db.execute(
        "INSERT INTO organization_members (id, organization_id, user_id, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), organization.id, profile.id, profile.role, 1, stamped, stamped],
      );
    } else {
      await db.execute(
        "UPDATE organization_members SET role = ?, is_active = ?, updated_at = ? WHERE id = ?",
        [profile.role, 1, stamped, members[0].id],
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
