import type { AccountingReadSource, ReadCursor } from "./readContracts";
import {validateReportCurrencyEvidence} from "./currencyReportEvidence";

const EXACT = /^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;
const TOKEN = /^[0-9a-f]{64}$/;

/** Arbitrary-precision SQL NUMERIC aggregate. Do NOT apply BIGINT limits. */
export function exactReadMinor(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !EXACT.test(value)) {
    throw new Error(`Invalid exact accounting amount: ${field}.`);
  }
  return BigInt(value);
}

export function nonNegativeReadMinor(value: unknown, field: string): bigint {
  const amount = exactReadMinor(value, field);
  if (amount < 0n) throw new Error(`Negative accounting amount: ${field}.`);
  return amount;
}

export function readRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name} object.`);
  }
  return value as Record<string, unknown>;
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field} string.`);
  }
  return value;
}

export interface VerifiedReadContext {
  organizationId: string;
  currency: string;
  fromDate: string;
  toDate: string;
}

/**
 * Client-side fail-closed checks, NOT a substitute for trusted SQL
 * membership authorization or source certification.
 */
export function validateCertifiedSource(
  value: unknown,
  context: VerifiedReadContext,
  first?: AccountingReadSource,
): AccountingReadSource {
  const s = readRecord(value, "certified source");
  if (s.contract_version !== "aqvora-read-v1" ||
      s.basis !== "v2_posted_journals" ||
      s.source_complete !== true ||
      s.legacy_included !== false ||
      s.opening_migration_verified !== false ||
      s.consistency !== "restart_on_source_change") {
    throw new Error("Financial source is not a complete certified V2 read.");
  }
  if (s.organization_id !== context.organizationId ||
      s.currency !== context.currency ||
      s.from_date !== context.fromDate ||
      s.to_date !== context.toDate) {
    throw new Error("Financial source context mismatch: company, currency or dates.");
  }
  if (typeof s.snapshot_token !== "string" || !TOKEN.test(s.snapshot_token)) {
    throw new Error("Financial source snapshot token is invalid.");
  }
  readString(s.authorized_user_id, "authorized user");
  if (s.authorized_role !== "OWNER" && s.authorized_role !== "MANAGER") {
    throw new Error("Unexpected financial reader authorization role.");
  }
  readString(s.observed_at, "source observation timestamp");
  const journals = nonNegativeReadMinor(s.source_journal_count, "journal count");
  const lines = nonNegativeReadMinor(s.source_line_count, "line count");
  const dr = nonNegativeReadMinor(s.source_debit_minor, "certified debit");
  const cr = nonNegativeReadMinor(s.source_credit_minor, "certified credit");
  if (dr !== cr || (journals === 0n && (lines !== 0n || dr !== 0n))) {
    throw new Error("Certified financial source is arithmetically inconsistent.");
  }
  if (first && (
    first.snapshot_token !== s.snapshot_token ||
    first.authorized_user_id !== s.authorized_user_id ||
    first.authorized_role !== s.authorized_role ||
    first.source_journal_count !== s.source_journal_count ||
    first.source_line_count !== s.source_line_count ||
    first.source_debit_minor !== s.source_debit_minor ||
    first.source_credit_minor !== s.source_credit_minor
  )) {
    throw new Error("Financial source changed while reading pages; discard all rows.");
  }
  // Codex #78 evidence is additive; legacy readers remain exact RAW minor units.
  // New evidence must never disappear, mutate or appear mid-pagination.
  const scope={organizationId:context.organizationId,currency:context.currency,
    asOfDate:context.toDate};
  const firstPolicy=first===undefined?undefined:
    validateReportCurrencyEvidence(first,scope);
  validateReportCurrencyEvidence(s,scope,firstPolicy);
  return s as unknown as AccountingReadSource;
}

export function validateReadAccount(
  value: unknown, company: string, expectedId?: string,
): void {
  const a = readRecord(value, "account");
  if (a.organization_id !== company || a.is_posting !== true ||
      typeof a.id !== "string" || !a.id ||
      (expectedId && a.id !== expectedId)) {
    throw new Error("Foreign, missing or non-posting financial account.");
  }
  readString(a.code, "account code");
  readString(a.name, "account name");
  nonNegativeReadMinor(a.revision, "account revision");
}

export function validatePageEnvelope(
  value: unknown, maxPerPage: number,
): { page: Record<string, unknown>; rows: unknown[]; count: bigint; cursor: ReadCursor | null } {
  const page = readRecord(value, "financial page");
  if (!Array.isArray(page.rows)) throw new Error("Financial rows must be an array.");
  const count = nonNegativeReadMinor(page.matched_count, "matched count");
  const len = page.rows.length;
  if (typeof page.returned_count !== "number" ||
      !Number.isSafeInteger(page.returned_count) ||
      page.returned_count !== len || len > maxPerPage) {
    throw new Error("Financial page row count is inconsistent.");
  }
  if (typeof page.has_more !== "boolean" ||
      (page.has_more && (len === 0 || page.next_cursor === null)) ||
      (!page.has_more && page.next_cursor !== null)) {
    throw new Error("Financial page continuation flag is inconsistent.");
  }
  const cursor = page.next_cursor === null
    ? null
    : readRecord(page.next_cursor, "financial cursor") as ReadCursor;
  return { page, rows: page.rows, count, cursor };
}

export function readOrdinal(value: unknown, expected: bigint): void {
  const actual = nonNegativeReadMinor(value, "row ordinal");
  if (actual !== expected) {
    throw new Error("Financial pages have a gap or duplicate ordinal.");
  }
}
