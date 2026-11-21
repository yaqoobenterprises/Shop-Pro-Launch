import { type FormEvent, useEffect, useRef, useState } from "react";
import { ClipboardCopy, LockKeyhole, UserRoundPlus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  acceptFreshOwnerInvitation, createFreshOwnerInvitation,
  isFreshOwnerInvitationStagingEnabled, normalizeInviteEmail,
  type FreshOwnerAcceptance, type FreshOwnerInvitation,
} from "../../services/aqvoraFreshOwnerInvitationService";

/**
 * Staging-only UI: does NOT enroll the writer, create companies, send emails,
 * switch companies or grant roles locally. Both actions call secured SQL RPCs.
 */
export function FreshOwnerInvitationsWorkspace() {
  const { user, organization, isCloudAccount, isDemoMode } = useAuth();
  const canUse = isFreshOwnerInvitationStagingEnabled() &&
    isCloudAccount && !isDemoMode && Boolean(user?.id);
  const isOwner = user?.role === "OWNER";
  const ctx = { userId: user?.id ?? "", isCloudAccount, isDemoMode };
  const [email, setEmail] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [issued, setIssued] = useState<FreshOwnerInvitation | null>(null);
  const [accepted, setAccepted] = useState<FreshOwnerAcceptance | null>(null);
  const [busy, setBusy] = useState<"invite" | "accept" | null>(null);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const attempt = useRef<{ email: string; company: string; intent: string } | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);

  useEffect(() => {
    const serial = generation;
    serial.current += 1;
    attempt.current = null;
    setIssued(null); setAccepted(null); setError(""); setCopyNotice("");
    setBusy(null);
    return () => { serial.current += 1; };
  }, [organization.id, user?.id, canUse]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUse || !isOwner || !organization.id || lock.current) return;
    const canonical = normalizeInviteEmail(email);
    if (attempt.current?.email !== canonical ||
        attempt.current?.company !== organization.id) {
      if (!globalThis.crypto?.randomUUID) {
        setError("A secure browser is required to issue invitation requests.");
        return;
      }
      attempt.current = {
        company: organization.id, email: canonical,
        intent: globalThis.crypto.randomUUID(),
      };
    }
    const pending = attempt.current;
    if (!pending) return;
    const serial = generation.current;
    lock.current = true; setBusy("invite"); setError(""); setCopyNotice("");
    try {
      const receipt = await createFreshOwnerInvitation(ctx, {
        organizationId: pending.company, email: pending.email,
        inviteIntent: pending.intent,
      });
      if (generation.current === serial) setIssued(receipt);
    } catch (reason) {
      if (generation.current === serial) setError(
        (reason instanceof Error ? reason.message : "Invitation failed.") +
        " If the request reached the server, retry with the same email to recover its original receipt.",
      );
    } finally { lock.current = false; if (generation.current === serial) setBusy(null); }
  }

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUse || lock.current) return;
    const serial = generation.current;
    lock.current = true; setBusy("accept"); setError("");
    try {
      const receipt = await acceptFreshOwnerInvitation(ctx, {
        organizationId: targetCompany.trim(),
        invitationId: invitationId.trim(),
      });
      if (generation.current === serial) setAccepted(receipt);
    } catch (reason) {
      if (generation.current === serial) setError(
        reason instanceof Error ? reason.message : "Acceptance was not verified.",
      );
    } finally { lock.current = false; if (generation.current === serial) setBusy(null); }
  }

  async function copyInvitation() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `AQVORA fresh-company OWNER invite\nCompany: ${issued.organization_id}\nInvitation: ${issued.invitation_id}`,
      );
      setCopyNotice("Invitation IDs copied. Share only with the intended verified recipient.");
    } catch {
      setCopyNotice("Clipboard access unavailable. Copy the two IDs manually.");
    }
  }

  if (!canUse) return <section role="status" className="page-content p-5 space-y-2">
    <h1 className="text-xl font-semibold">Owner invitations</h1>
    <p className="text-sm text-text-muted">
      This workflow is available only in an isolated staging project with verified cloud login.
      It is disabled for the existing production companies and sample accounts.
    </p>
  </section>;

  return <main className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-1">
      <span className="text-xs font-bold text-primary">FRESH AQVORA · ISOLATED STAGING</span>
      <h1 className="text-2xl font-semibold">Second company owner</h1>
      <p className="max-w-3xl text-sm text-text-muted">
        Two independent verified people must approve initial finance activation.
        Issuing or accepting an invitation never activates posting.
      </p>
    </header>
    {error && <p role="alert"
      className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {isOwner && <section aria-labelledby="issue-owner-heading"
        className="space-y-4 rounded-xl border border-border-standard bg-surface-bright p-5">
        <div className="space-y-1">
          <h2 id="issue-owner-heading" className="flex items-center gap-2 text-lg font-semibold">
            <UserRoundPlus size={18} aria-hidden="true"/> Invite a second OWNER
          </h2>
          <p className="text-sm text-text-muted">
            Only works for a genuinely new company recognized by the secure server.
          </p>
        </div>
        <form onSubmit={event => void invite(event)} className="space-y-3">
          <p className="break-all text-xs text-text-muted">
            Current company ID: {organization.id}
          </p>
          <label className="block text-sm">Recipient's verified email
            <input type="email" required autoComplete="email" maxLength={254}
              disabled={Boolean(busy)} value={email}
              onChange={event => { setEmail(event.target.value); setIssued(null); attempt.current = null; }}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"
              placeholder="second-owner@example.com"/>
          </label>
          <button type="submit" disabled={Boolean(busy) || !email.trim()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "invite" ? "Verifying invitation…" : "Create secure invitation"}
          </button>
        </form>
        {issued && <div role="status" className="space-y-2 rounded-xl border border-border-standard p-3">
          <p className="text-sm font-semibold">Awaiting recipient acceptance</p>
          <p className="text-xs text-text-muted">
            No email has been sent. Give these IDs only to the intended recipient.
            They still need their own confirmed email and MFA.
          </p>
          <p className="break-all font-mono text-xs">Company: {issued.organization_id}</p>
          <p className="break-all font-mono text-xs">Invitation: {issued.invitation_id}</p>
          <p className="text-xs text-text-muted">
            Expires: {new Date(issued.expires_at).toLocaleString()}
          </p>
          <button type="button" onClick={() => void copyInvitation()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-standard px-3 text-sm">
            <ClipboardCopy size={16} aria-hidden="true"/> Copy invitation
          </button>
          {copyNotice && <p role="status" className="text-xs text-text-muted">{copyNotice}</p>}
        </div>}
      </section>}
      <section aria-labelledby="accept-owner-heading"
        className="space-y-4 rounded-xl border border-border-standard bg-surface-bright p-5">
        <div className="space-y-1">
          <h2 id="accept-owner-heading" className="text-lg font-semibold">Accept an invitation</h2>
          <p className="text-sm text-text-muted">
            Sign in with your own confirmed invitation email and complete MFA first.
          </p>
        </div>
        <form onSubmit={event => void accept(event)} className="space-y-3">
          <label className="block text-sm">Inviting company UUID
            <input required value={targetCompany}
              onChange={event => { setTargetCompany(event.target.value); setAccepted(null); }}
              disabled={Boolean(busy)} placeholder="Company UUID"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3 font-mono text-sm"/>
          </label>
          <label className="block text-sm">Invitation UUID
            <input required value={invitationId}
              onChange={event => { setInvitationId(event.target.value); setAccepted(null); }}
              disabled={Boolean(busy)} placeholder="Invitation UUID"
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3 font-mono text-sm"/>
          </label>
          <button type="submit" disabled={Boolean(busy) || !targetCompany.trim() || !invitationId.trim()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "accept" ? "Verifying acceptance…" : "Accept as verified OWNER"}
          </button>
        </form>
        {accepted && <div role="status" className="space-y-2 rounded-lg border border-border-standard p-3">
          <p className="text-sm font-semibold">Server confirmed OWNER membership</p>
          <p className="text-xs text-text-muted">
            Company switching is not available in this staging screen.
            This confirmation does not enable journal posting or move your current workspace.
          </p>
          <p className="break-all font-mono text-xs">Acceptance: {accepted.invitation_id}</p>
        </div>}
      </section>
    </div>
    <p className="flex items-start gap-2 text-xs text-text-muted">
      <LockKeyhole size={15} className="shrink-0" aria-hidden="true"/>
      Server controls company membership, identity, invitation expiry and replay safety.
      Do not share invitation codes publicly. No existing-business changes are authorized.
    </p>
  </main>;
}
