import { assertPostingAccount, assertValidChart } from "./chartOfAccounts";
import { addExact, parseMinorUnits, validBusinessDate } from "./minorUnits";
import type {
  ChartAccount, JournalDraftInput, JournalIssue, JournalPreview, JournalPreviewPolicy,
} from "./types";

/**
 * Local draft check before an authoritative server preview.
 * canSubmitForServerReview NEVER means a voucher is posted or authorized.
 */
export function previewJournalDraft(
  draft: JournalDraftInput,
  policy: JournalPreviewPolicy,
  accounts: ChartAccount[],
): JournalPreview {
  const issues: JournalIssue[] = [];
  const issue = (code: string, message: string, lineIndex?: number) =>
    issues.push({ code, message, ...(lineIndex === undefined ? {} : { lineIndex }) });
  let debit = 0n;
  let credit = 0n;
  let chart: Map<string, ChartAccount> | null = null;

  try {
    chart = assertValidChart(policy.organizationId, accounts);
  } catch (failure) {
    issue("invalid_chart", failure instanceof Error ? failure.message : "Account chart unavailable.");
  }
  if (!policy.organizationId || draft.organizationId !== policy.organizationId) {
    issue("company_mismatch", "Journal must belong to the selected company.");
  }
  if (!draft.currency || draft.currency !== policy.currency) {
    issue("currency_mismatch", "Journal currency must match the company book.");
  }
  if (!validBusinessDate(draft.businessDate)) {
    issue("invalid_date", "Choose a valid business date.");
  } else if (
    !validBusinessDate(policy.periodStart) ||
    !validBusinessDate(policy.periodEnd) ||
    policy.periodStart > policy.periodEnd ||
    draft.businessDate < policy.periodStart ||
    draft.businessDate > policy.periodEnd
  ) {
    issue("outside_period", "Journal date is outside the selected accounting period.");
  }
  if (policy.periodState !== "open") {
    issue("period_locked", "This accounting period is not open for draft submission.");
  }
  if (!draft.intentId.trim()) {
    issue("missing_intent", "Journal needs a stable posting intent ID.");
  }
  if (draft.lines.length < 2) {
    issue("few_lines", "Every journal requires at least two lines.");
  }

  const lineIds = new Set<string>();
  draft.lines.forEach((line, index) => {
    if (!line.lineId.trim() || lineIds.has(line.lineId)) {
      issue("line_id", "Each line needs a distinct stable ID.", index);
    } else {
      lineIds.add(line.lineId);
    }
    if (chart) {
      try {
        assertPostingAccount(chart, line.accountId, line);
      } catch (failure) {
        issue("account", failure instanceof Error ? failure.message : "Account unavailable.", index);
      }
    }

    try {
      const dr = parseMinorUnits(line.debitMinor);
      const cr = parseMinorUnits(line.creditMinor);
      if ((dr > 0n) === (cr > 0n) || dr < 0n || cr < 0n) {
        issue("side", "Exactly one side must be positive, with the other zero.", index);
      } else {
        debit = addExact(debit, dr);
        credit = addExact(credit, cr);
      }
    } catch (failure) {
      issue("amount", failure instanceof Error ? failure.message : "Invalid minor-unit amount.", index);
    }
  });

  if (debit !== credit) {
    issue("unbalanced", `Journal differs by ${(debit - credit).toString()} minor units.`);
  }
  if (debit === 0n && credit === 0n) {
    issue("no_posting", "Journal has no valid monetary movement.");
  }

  return {
    debitMinor: debit.toString(),
    creditMinor: credit.toString(),
    differenceMinor: (debit - credit).toString(),
    balanced: debit === credit && debit > 0n,
    canSubmitForServerReview: issues.length === 0,
    issues,
  };
}
