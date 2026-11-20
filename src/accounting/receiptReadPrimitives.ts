import { validBusinessDate } from "./minorUnits";
import type { AccountingReadSource } from "./readContracts";

/**
 * Runtime checks for untrusted JSON from the certified V2 reads in PR #63.
 * The SQL server, not this browser code, authenticates and certifies records.
 * No money is posted, no cached amount authorizes a settlement.
 */
const UINT = /^(0|[1-9][0-9]*)$/;
const SHA = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT_MAX = 9223372036854775807n;

export interface ReceivableReadContext {
  organizationId: string;
  currency: string;
  asOfDate: string;
  customerId?: string;
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed AQVORA " + label + " response.");
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error("Invalid AQVORA " + label + " string.");
  }
  return value;
}

export function uuid(value: unknown, label: string): string {
  if (!UUID.test(nonempty(value, label))) {
    throw new Error("Invalid AQVORA " + label + " identifier.");
  }
  return value as string;
}

export function date(value: unknown, label: string): string {
  const valueDate = nonempty(value, label);
  if (!validBusinessDate(valueDate)) {
    throw new Error("Invalid AQVORA " + label + " date.");
  }
  return valueDate;
}

export function money(value: unknown, label: string, bigintOnly = false): bigint {
  if (typeof value !== "string" || !UINT.test(value)) {
    throw new Error("Invalid exact AQVORA " + label + " minor-unit string.");
  }
  const amount = BigInt(value);
  if (bigintOnly && amount > BIGINT_MAX) {
    throw new Error("AQVORA " + label + " exceeds signed BIGINT.");
  }
  return amount;
}

export function validateContext(context: ReceivableReadContext): void {
  uuid(context.organizationId, "organization");
  if (!/^[A-Z]{3}$/.test(context.currency)) {
    throw new Error("Invalid AQVORA currency.");
  }
  date(context.asOfDate, "as-of");
  if (context.customerId !== undefined) uuid(context.customerId, "customer");
}

/**
 * Certified source metadata is V2-only and excludes historical legacy books.
 * Its token is a change detector, NOT a cryptographic authorization proof.
 */
export function verifyReceivablesSource(
  value: unknown,
  context: ReceivableReadContext,
  expectedToken?: string,
): AccountingReadSource {
  validateContext(context);
  const src = object(value, "source certification");
  if (src.contract_version !== "aqvora-read-v1" ||
      src.organization_id !== context.organizationId ||
      src.currency !== context.currency ||
      src.from_date !== "0001-01-01" ||
      src.to_date !== context.asOfDate ||
      src.basis !== "v2_posted_journals" ||
      src.source_complete !== true ||
      src.legacy_included !== false ||
      src.opening_migration_verified !== false ||
      src.consistency !== "restart_on_source_change") {
    throw new Error("AQVORA source is not a complete matching V2 read.");
  }
  if (src.authorized_role !== "OWNER" && src.authorized_role !== "MANAGER") {
    throw new Error("Unexpected AQVORA source authorization role.");
  }
  uuid(src.authorized_user_id, "certified reader");
  nonempty(src.observed_at, "observation timestamp");
  if (typeof src.snapshot_token !== "string" || !SHA.test(src.snapshot_token) ||
      expectedToken !== undefined && src.snapshot_token !== expectedToken) {
    throw new Error("AQVORA certified source changed; restart from first page.");
  }
  const journals = money(src.source_journal_count, "journal count");
  const lines = money(src.source_line_count, "line count");
  const dr = money(src.source_debit_minor, "source debits");
  const cr = money(src.source_credit_minor, "source credits");
  if (dr !== cr || journals === 0n && (lines !== 0n || dr !== 0n)) {
    throw new Error("AQVORA source financial totals are inconsistent.");
  }
  return src as unknown as AccountingReadSource;
}

