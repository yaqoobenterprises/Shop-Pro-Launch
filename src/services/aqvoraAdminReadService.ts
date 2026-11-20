/**
 * AQVORA V2 secure administration *read-only* integration boundary.
 *
 * Matches Codex Phase 4 docs/aqvora-admin-api.md (Draft PR #44).
 * Not mounted into the product yet: no real Supabase staging has been certified.
 * Never falls back from a failed company read to illustrative/sample finances.
 */
import type { ChartAccount, AccountClass, AccountSide, ControlRole } from "../accounting/types";
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";

export interface AqvoraChartRow extends ChartAccount {
  revision: string;
}

export interface AqvoraFiscalPeriod {
  id: string;
  organizationId: string;
  startsOn: string;
  endsOn: string;
  state: "open" | "closed";
  reopenCount: number;
  revision: string;
}

export interface AqvoraAdminReadSnapshot {
  organizationId: string;
  accounts: AqvoraChartRow[];
  periods: AqvoraFiscalPeriod[];
  source: "authenticated-admin-rpc";
  /** True only for the loaded pages, not a claim that all pages were loaded. */
  hasMoreAccounts: boolean;
  hasMorePeriods: boolean;
}

export interface AqvoraAdminReadRequest {
  organizationId: string;
  userId: string;
  isCloudAccount: boolean;
}

type DatabaseRow = Record<string, unknown>;

const ACCOUNT_CLASSES: readonly AccountClass[] = [
  "asset", "liability", "equity", "revenue", "cost_of_sales",
  "expense", "other_income", "other_expense",
];
const NORMAL_SIDES: readonly AccountSide[] = ["debit", "credit"];
const CONTROL_ROLES: readonly ControlRole[] = ["cash", "receivable", "payable", "inventory", "tax"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const record = (value: unknown, label: string): DatabaseRow => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AQVORA ${label} server response is malformed.`);
  }
  return value as DatabaseRow;
};

const nonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AQVORA ${label} is missing from the server response.`);
  }
  return value;
};

const dbBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`AQVORA ${label} must be boolean.`);
  return value;
};

/** Never round away a Postgres BIGINT revision before later optimistic locking. */
const revisionString = (value: unknown): string => {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return String(value);
  throw new Error("AQVORA revision could not be represented exactly.");
};

const page = (value: unknown, label: string): DatabaseRow[] => {
  if (!Array.isArray(value)) throw new Error(`AQVORA ${label} response must be a list.`);
  return value.map((item) => record(item, label));
};

const account = (raw: DatabaseRow, organizationId: string): AqvoraChartRow => {
  if (raw.organization_id !== organizationId) {
    throw new Error("AQVORA account tenant mismatch; refusing financial data.");
  }
  const accountClass = raw.account_class;
  const normalSide = raw.normal_side;
  const controlRole = raw.control_role;
  if (!ACCOUNT_CLASSES.includes(accountClass as AccountClass) ||
      !NORMAL_SIDES.includes(normalSide as AccountSide) ||
      (controlRole !== null && controlRole !== undefined &&
       !CONTROL_ROLES.includes(controlRole as ControlRole))) {
    throw new Error("AQVORA account classification is invalid.");
  }
  const parentId = raw.parent_id;
  if (parentId !== null && parentId !== undefined && typeof parentId !== "string") {
    throw new Error("AQVORA account parent reference is invalid.");
  }
  return {
    organizationId,
    id: nonEmptyString(raw.id, "account ID"),
    code: nonEmptyString(raw.code, "account code"),
    name: nonEmptyString(raw.name, "account name"),
    accountClass: accountClass as AccountClass,
    normalSide: normalSide as AccountSide,
    parentId: typeof parentId === "string" ? parentId : null,
    isPosting: dbBoolean(raw.is_posting, "account posting flag"),
    isActive: dbBoolean(raw.is_active, "account active flag"),
    ...(controlRole ? { controlRole: controlRole as ControlRole } : {}),
    revision: revisionString(raw.revision),
  };
};

const period = (raw: DatabaseRow, organizationId: string): AqvoraFiscalPeriod => {
  if (raw.organization_id !== organizationId) {
    throw new Error("AQVORA fiscal period tenant mismatch; refusing financial data.");
  }
  const startsOn = nonEmptyString(raw.starts_on, "period start date");
  const endsOn = nonEmptyString(raw.ends_on, "period end date");
  if (!DATE_RE.test(startsOn) || !DATE_RE.test(endsOn) || startsOn > endsOn ||
      (raw.state !== "open" && raw.state !== "closed") ||
      typeof raw.reopen_count !== "number" || !Number.isSafeInteger(raw.reopen_count) ||
      raw.reopen_count < 0) {
    throw new Error("AQVORA fiscal period response is invalid.");
  }
  return {
    organizationId,
    id: nonEmptyString(raw.id, "period ID"),
    startsOn,
    endsOn,
    state: raw.state as "open" | "closed",
    reopenCount: raw.reopen_count,
    revision: revisionString(raw.revision),
  };
};

export function isAqvoraAdminReadPreviewEnabled(): boolean {
  // Explicit opt-in, default OFF on production and all other deployments.
  return import.meta.env.VITE_ENABLE_AQVORA_ADMIN_READS === "true";
}

/**
 * One authorized page per type (<=200). Pagination cursors are needed before
 * anyone may claim a complete chart; missing V2 enrollment is never a zero balance.
 */
export async function loadAqvoraAdminReadSnapshot(
  request: AqvoraAdminReadRequest,
): Promise<AqvoraAdminReadSnapshot> {
  if (!isAqvoraAdminReadPreviewEnabled()) {
    throw new Error("AQVORA V2 cloud administration preview is not enabled.");
  }
  const { userId, organizationId, isCloudAccount } = request;
  if (!isCloudAccount || !userId || !organizationId) {
    throw new Error("A signed-in cloud company is required for AQVORA V2 administration.");
  }
  if (!(await hasConfiguredCloudSession(userId))) {
    throw new Error("Company session expired or cloud unavailable. Sign in to continue.");
  }

  const client = getSupabaseClient();
  const [accountsResult, periodsResult] = await Promise.all([
    client.rpc("list_aqvora_accounts", {
      p_organization_id: organizationId,
      p_after_code: null,
      p_limit: 200,
    }),
    client.rpc("list_aqvora_periods", {
      p_organization_id: organizationId,
      p_before_start: null,
      p_limit: 200,
    }),
  ]);
  if (accountsResult.error || periodsResult.error) {
    // A missing migration, MFA denial or RLS failure is NOT an empty company book.
    throw new Error("AQVORA V2 administration could not be verified by the server.");
  }
  const accountRows = page(accountsResult.data, "account list");
  const periodRows = page(periodsResult.data, "fiscal period list");
  return {
    organizationId,
    accounts: accountRows.map((row) => account(row, organizationId)),
    periods: periodRows.map((row) => period(row, organizationId)),
    source: "authenticated-admin-rpc",
    hasMoreAccounts: accountRows.length === 200,
    hasMorePeriods: periodRows.length === 200,
  };
}


/**
 * Fetch additional cursor pages for a complete *administration listing*.
 * This is NOT a transactionally certified financial report or trial balance.
 * Each page is separately authenticated; no partial collection is returned on
 * denial, cursor drift, malformed payload, or tenant mismatch.
 */
const RPC_PAGE_SIZE = 200;
const MAX_ACCOUNTS = 5000;
const MAX_PERIODS = 1200;

async function loadAdditionalPages<T extends { id: string }>(
  firstRows: T[],
  firstHasMore: boolean,
  organizationId: string,
  kind: "accounts" | "periods",
  parse: (raw: DatabaseRow, organizationId: string) => T,
  cursorOf: (row: T) => string,
  orderedAfter: (current: string, previous: string) => boolean,
  maxRows: number,
): Promise<{ rows: T[]; hasMore: boolean }> {
  const rows = [...firstRows];
  const seenIds = new Set(rows.map((row) => row.id));
  const seenCursors = new Set(rows.map(cursorOf));
  if (seenIds.size !== rows.length || seenCursors.size !== rows.length) {
    throw new Error("AQVORA administration contains duplicate record IDs or cursors.");
  }
  // A full first page may still be the final page; request another to know.
  let hasMore = firstHasMore;
  let previous = rows.length ? cursorOf(rows[rows.length - 1]) : null;
  const rpcName = kind === "accounts" ? "list_aqvora_accounts" : "list_aqvora_periods";
  while (hasMore && rows.length < maxRows) {
    if (!previous) throw new Error("AQVORA pagination cursor was missing.");
    const params = kind === "accounts"
      ? { p_organization_id: organizationId, p_after_code: previous, p_limit: RPC_PAGE_SIZE }
      : { p_organization_id: organizationId, p_before_start: previous, p_limit: RPC_PAGE_SIZE };
    const result = await getSupabaseClient().rpc(rpcName, params);
    if (result.error) {
      throw new Error("AQVORA administration pagination could not be verified by the server.");
    }
    const rawRows = page(result.data, kind);
    for (const rawRow of rawRows) {
      const parsed = parse(rawRow, organizationId);
      const cursor = cursorOf(parsed);
      if (!orderedAfter(cursor, previous) || seenIds.has(parsed.id) || seenCursors.has(cursor)) {
        throw new Error("AQVORA administration pagination returned out-of-order or duplicate records.");
      }
      seenIds.add(parsed.id);
      seenCursors.add(cursor);
      rows.push(parsed);
      previous = cursor;
    }
    hasMore = rawRows.length === RPC_PAGE_SIZE;
  }
  return { rows, hasMore };
}

/** A fail-closed full listing (bounded): never silently equates a partial page with all books. */
export async function loadAqvoraCompleteAdminReadSnapshot(
  request: AqvoraAdminReadRequest,
): Promise<AqvoraAdminReadSnapshot> {
  const first = await loadAqvoraAdminReadSnapshot(request);
  const [accountPages, periodPages] = await Promise.all([
    loadAdditionalPages(
      first.accounts, first.hasMoreAccounts, request.organizationId, "accounts", account,
      (row) => row.code.toUpperCase(), (current, previous) => current > previous, MAX_ACCOUNTS,
    ),
    loadAdditionalPages(
      first.periods, first.hasMorePeriods, request.organizationId, "periods", period,
      (row) => row.startsOn, (current, previous) => current < previous, MAX_PERIODS,
    ),
  ]);
  return {
    ...first,
    accounts: accountPages.rows,
    periods: periodPages.rows,
    hasMoreAccounts: accountPages.hasMore,
    hasMorePeriods: periodPages.hasMore,
  };
}
