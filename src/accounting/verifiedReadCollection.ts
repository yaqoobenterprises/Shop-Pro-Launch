import { validBusinessDate } from "./minorUnits";
import type { AccountingReadSource, ReadCursor } from "./readContracts";
import {
  readRecord, readOrdinal, readString, validateCertifiedSource,
  validatePageEnvelope, type VerifiedReadContext,
} from "./verifiedReadValidation";

export type FinancialPageRpc = (args: Record<string, unknown>) => Promise<unknown>;

export interface CollectionOptions {
  /** 1..200 SQL API page size. */
  pageSize?: number;
  /** Fail closed if the selected company cannot be read within this bound. */
  maxPages?: number;
  maxRows?: number;
}

export interface VerifiedCollection<TRow> {
  source: AccountingReadSource;
  rows: TRow[];
  matchedCount: string;
  pageCount: number;
}

interface CollectInput<TRow> {
  rpc: FinancialPageRpc;
  request: Record<string, unknown>;
  options?: CollectionOptions;
  expectedKind: "general_ledger" | "trial_balance";
  reportIdentity: (page: Record<string, unknown>) => unknown;
  validateRow: (row: unknown, ordinal: bigint) => TRow;
  validateCompleted: (rows: TRow[], first: Record<string, unknown>) => void;
}

function validateRequest(request: Record<string, unknown>): VerifiedReadContext {
  const organizationId = readString(request.p_organization_id, "requested organization");
  const currency = readString(request.p_currency, "requested currency");
  const fromDate = readString(request.p_from_date, "report from date");
  const toDate = readString(request.p_to_date, "report to date");
  if (!/^[A-Z]{3}$/.test(currency) || !validBusinessDate(fromDate) ||
      !validBusinessDate(toDate) || fromDate > toDate) {
    throw new Error("Invalid financial report request filters.");
  }
  return { organizationId, currency, fromDate, toDate };
}

/** Does not retry 40001 inside a partial collection. Callers may restart from scratch. */
export async function collectCertifiedRead<TRow>(
  input: CollectInput<TRow>,
): Promise<VerifiedCollection<TRow>> {
  const context = validateRequest(input.request);
  const pageSize = input.options?.pageSize ?? 100;
  const maxPages = input.options?.maxPages ?? 100;
  const maxRows = input.options?.maxRows ?? 20_000;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1_000 ||
      !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 200_000) {
    throw new Error("Invalid bounded financial report reader configuration.");
  }

  let source: AccountingReadSource | undefined;
  let count: bigint | undefined;
  let identity: string | undefined;
  let firstPage: Record<string, unknown> | undefined;
  let cursor: ReadCursor | null = null;
  const observedCursors = new Set<string>();
  const rows: TRow[] = [];

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const response = await input.rpc({
      ...input.request,
      p_limit: pageSize,
      p_cursor: cursor,
      p_snapshot_token: source?.snapshot_token ?? null,
    });
    const page = readRecord(response, "financial RPC response");
    const verified = validateCertifiedSource(page.source, context, source);
    const envelope = validatePageEnvelope(page, pageSize);
    if (source && envelope.count !== count) {
      throw new Error("Financial report matched count changed across pages.");
    }
    if (envelope.count > BigInt(maxRows)) {
      throw new Error("Certified report exceeds supported bounded row count.");
    }
    const pageIdentity = JSON.stringify(input.reportIdentity(page));
    if (identity !== undefined && pageIdentity !== identity) {
      throw new Error("Financial report totals or account identity changed across pages.");
    }

    const baseOrdinal = BigInt(rows.length);
    for (const [index, item] of envelope.rows.entries()) {
      const row = readRecord(item, "financial row");
      readOrdinal(row.ordinal, baseOrdinal + BigInt(index) + 1n);
      rows.push(input.validateRow(row, baseOrdinal + BigInt(index) + 1n));
    }
    if (BigInt(rows.length) > envelope.count) {
      throw new Error("Financial report contains more rows than certified.");
    }
    if (envelope.cursor !== null) {
      const next = readRecord(envelope.cursor, "next cursor");
      if (next.kind !== input.expectedKind || next.snapshot_token !== verified.snapshot_token) {
        throw new Error("Financial continuation belongs to another report or source.");
      }
      const key = JSON.stringify(next);
      if (observedCursors.has(key)) {
        throw new Error("Financial continuation cursor loop detected.");
      }
      observedCursors.add(key);
    }
    source ??= verified;
    count ??= envelope.count;
    identity ??= pageIdentity;
    firstPage ??= page;

    if (!page.has_more) {
      if (envelope.cursor !== null || BigInt(rows.length) !== envelope.count) {
        throw new Error("Financial collection is incomplete despite terminal page.");
      }
      input.validateCompleted(rows, firstPage);
      return { source, rows, matchedCount: count.toString(), pageCount: pageNumber + 1 };
    }
    if (envelope.cursor === null || BigInt(rows.length) >= count) {
      throw new Error("Financial continuation cannot be reconciled with the matched count.");
    }
    cursor = envelope.cursor;
  }
  throw new Error("Financial report exceeds pagination limit; no partial report returned.");
}
