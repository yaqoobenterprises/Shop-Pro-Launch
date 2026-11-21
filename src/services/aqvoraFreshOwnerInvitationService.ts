/**
 * Fresh-company second OWNER invitation transport.
 * Fail closed unless a genuinely separate Supabase staging project is selected.
 * Server RPCs remain the sole authority for membership changes.
 */
import {
  getSupabaseClient, hasConfiguredCloudSession,
} from "../lib/supabase";
import { isIsolatedVerifiedFinancialReadEnabled } from "./aqvoraVerifiedFinancialReadService";

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const EMAIL = /^[a-z0-9._%+~-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export interface OwnerInviteSession {
  userId: string;
  isCloudAccount: boolean;
  isDemoMode: boolean;
}
export interface FreshOwnerInvitation {
  organization_id: string;
  invitation_id: string;
  invite_intent: string;
  expires_at: string;
  status: "awaiting_verified_owner_acceptance";
}
export interface FreshOwnerAcceptance {
  organization_id: string;
  invitation_id: string;
  accepted_by: string;
  accepted_at: string;
  status: "verified_owner_joined";
}

export function isFreshOwnerInvitationStagingEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_AQVORA_OWNER_INVITES === "true" &&
    isIsolatedVerifiedFinancialReadEnabled();
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidUuid(value: string): boolean {
  return UUID.test(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Owner invitation RPC returned an invalid receipt.");
  }
  return value as Record<string, unknown>;
}
async function assertOwnerInviteSession(ctx: OwnerInviteSession): Promise<void> {
  if (!isFreshOwnerInvitationStagingEnabled() || !ctx.isCloudAccount ||
      ctx.isDemoMode || !isValidUuid(ctx.userId) ||
      !(await hasConfiguredCloudSession(ctx.userId))) {
    throw new Error("Verified cloud access to isolated AQVORA staging is required.");
  }
  const client = getSupabaseClient();
  const [auth, assurance] = await Promise.all([
    client.auth.getUser(),
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (auth.error || auth.data.user?.id !== ctx.userId ||
      assurance.error || assurance.data.currentLevel !== "aal2") {
    throw new Error("Sign in and complete MFA before managing OWNER invitations.");
  }
}

export async function createFreshOwnerInvitation(
  ctx: OwnerInviteSession,
  input: { organizationId: string; email: string; inviteIntent: string },
): Promise<FreshOwnerInvitation> {
  const email = normalizeInviteEmail(input.email);
  if (!isValidUuid(input.organizationId) || !isValidUuid(input.inviteIntent) ||
      email.length > 254 || !EMAIL.test(email)) {
    throw new Error("Enter a valid company, email and invitation request.");
  }
  await assertOwnerInviteSession(ctx);
  const { data, error } = await getSupabaseClient().rpc(
    "create_aqvora_fresh_owner_invite",
    { p_organization_id: input.organizationId,
      p_invite_intent: input.inviteIntent, p_invitee_email: email },
  );
  if (error) throw new Error(error.message);
  await assertOwnerInviteSession(ctx);
  const receipt = record(data);
  if (receipt.organization_id !== input.organizationId ||
      receipt.invite_intent !== input.inviteIntent ||
      !isValidUuid(String(receipt.invitation_id || "")) ||
      receipt.status !== "awaiting_verified_owner_acceptance" ||
      typeof receipt.expires_at !== "string" ||
      !Number.isFinite(Date.parse(receipt.expires_at))) {
    throw new Error("Invitation RPC returned mismatched or incomplete evidence.");
  }
  return receipt as unknown as FreshOwnerInvitation;
}

export async function acceptFreshOwnerInvitation(
  ctx: OwnerInviteSession,
  input: { organizationId: string; invitationId: string },
): Promise<FreshOwnerAcceptance> {
  if (!isValidUuid(input.organizationId) || !isValidUuid(input.invitationId)) {
    throw new Error("Enter both valid company and invitation IDs.");
  }
  await assertOwnerInviteSession(ctx);
  const { data, error } = await getSupabaseClient().rpc(
    "accept_aqvora_fresh_owner_invite",
    { p_organization_id: input.organizationId,
      p_invitation_id: input.invitationId },
  );
  if (error) throw new Error(error.message);
  await assertOwnerInviteSession(ctx);
  const receipt = record(data);
  if (receipt.organization_id !== input.organizationId ||
      receipt.invitation_id !== input.invitationId ||
      receipt.accepted_by !== ctx.userId ||
      receipt.status !== "verified_owner_joined" ||
      typeof receipt.accepted_at !== "string" ||
      !Number.isFinite(Date.parse(receipt.accepted_at))) {
    throw new Error("Acceptance RPC returned foreign or incomplete evidence.");
  }
  return receipt as unknown as FreshOwnerAcceptance;
}
