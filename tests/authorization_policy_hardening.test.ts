// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthorizationHardeningDb, orgA, managerId, ownerId,
  inactiveId, cashierId, categoryA,
} from "./support/authorizationHardeningDb";

describe("authorization policy boundaries", () => {
  let db: Awaited<ReturnType<typeof createAuthorizationHardeningDb>>;

  beforeAll(async () => {
    db = await createAuthorizationHardeningDb();
  });

  afterAll(async () => db.close());

  it("allows managers to read their shop but limits organization updates to owners", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);

    expect((await db.query("SELECT id FROM public.organizations WHERE id = $1", [orgA])).rows)
      .toHaveLength(1);

    const managerUpdate = await db.query(
      "UPDATE public.organizations SET name = 'Manager Attempt' WHERE id = $1",
      [orgA],
    );
    expect(managerUpdate.rowCount).toBe(0);

    await db.exec("RESET ROLE");
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${ownerId}', false);
      SET ROLE authenticated;
    `);
    const ownerUpdate = await db.query(
      "UPDATE public.organizations SET name = 'Owner Update' WHERE id = $1",
      [orgA],
    );
    expect(ownerUpdate.rowCount).toBe(1);
  });

  it("does not reactivate an explicitly inactive organization membership during sign-in provisioning", async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${inactiveId}', false);
      SET ROLE authenticated;
    `);

    await db.query("SELECT public.ensure_my_profile()");

    const membership = await db.query(
      "SELECT is_active FROM public.organization_members WHERE organization_id = $1 AND user_id = $2",
      [orgA, inactiveId],
    );
    expect(membership.rows[0].is_active).toBe(false);

    expect((await db.query("SELECT public.get_auth_org_id() AS organization_id")).rows[0].organization_id)
      .toBeNull();
    expect((await db.query("SELECT public.is_active_shop_member() AS active")).rows[0].active)
      .toBe(false);
    expect((await db.query("SELECT id FROM public.organizations WHERE id = $1", [orgA])).rows)
      .toHaveLength(0);
  });

  it("does not allow cashiers to bypass MANAGE_INVENTORY through legacy category policies", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${cashierId}', false);
      SET ROLE authenticated;
    `);

    const update = await db.query(
      "UPDATE public.categories SET name = 'Cashier Attempt' WHERE id = $1",
      [categoryA],
    );
    expect(update.rowCount).toBe(0);

    await expect(db.query(
      "INSERT INTO public.categories (id, organization_id, name) VALUES ($1, $2, 'Cashier Attempt')",
      ["99999999-9999-4999-8999-999999999999", orgA],
    )).rejects.toThrow();

    await db.exec("RESET ROLE");
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);
    const managerInsert = await db.query(
      "INSERT INTO public.categories (id, organization_id, name) VALUES ($1, $2, 'Manager Category')",
      ["aaaaaaaa-9999-4999-8999-999999999999", orgA],
    );
    expect(managerInsert.rowCount).toBe(1);
  });

  it("removes anonymous draft-table privileges while retaining authenticated access", async () => {
    const grants = await db.query(`
      SELECT
        has_table_privilege('anon', 'public.transaction_drafts', 'SELECT') AS anon_select,
        has_table_privilege('anon', 'public.transaction_drafts', 'INSERT') AS anon_insert,
        has_table_privilege('anon', 'public.transaction_drafts', 'UPDATE') AS anon_update,
        has_table_privilege('authenticated', 'public.transaction_drafts', 'INSERT') AS authenticated_insert
    `);
    expect(grants.rows[0]).toEqual({
      anon_select: false,
      anon_insert: false,
      anon_update: false,
      authenticated_insert: true,
    });
  });

});
