import type { SalesCustomer } from "../accounting/salesContracts";
import { money, uuid } from "../accounting/receiptReadPrimitives";
import {
  requestIsolatedReceivablesRpc, requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";

/** Customers are live keyset reads, NOT a certified immutable report snapshot. */
export interface IsolatedCustomerList {
  customers: SalesCustomer[];
  sourceComplete: false;
  endReached: boolean;
}

function validateCustomer(
  value: unknown, organizationId: string, previousCode: string,
): SalesCustomer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed AQVORA customer record.");
  }
  const customer = value as Record<string, unknown>;
  if (customer.organization_id !== organizationId ||
      typeof customer.code !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(customer.code) ||
      customer.code <= previousCode ||
      typeof customer.name !== "string" ||
      customer.name.trim().length === 0 ||
      customer.name.length > 160 ||
      customer.is_active !== true && customer.is_active !== false) {
    throw new Error("Foreign, duplicated or invalid customer in source page.");
  }
  uuid(customer.id, "customer");
  uuid(customer.created_by, "customer creator");
  if (money(customer.revision, "customer revision") < 1n) {
    throw new Error("Customer revision must be positive.");
  }
  return customer as unknown as SalesCustomer;
}

export async function loadIsolatedSalesCustomers(
  context: IsolatedReceivablesContext,
  opts: {pageSize?: number; maxPages?: number} = {},
): Promise<IsolatedCustomerList> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 10;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new Error("Invalid bounded customer list request.");
  }
  await requireIsolatedReceivablesSession(context);
  const customers: SalesCustomer[] = [];
  let previousCode = "";
  const seenIds = new Set<string>();
  for (let page = 0; page < maxPages; page += 1) {
    const raw = await requestIsolatedReceivablesRpc(
      context, "list_aqvora_customers", {
        p_organization_id: context.organizationId,
        p_after_code: previousCode || null,
        p_limit: pageSize,
      },
    );
    if (!Array.isArray(raw) || raw.length > pageSize) {
      throw new Error("Invalid AQVORA customers page.");
    }
    for (const item of raw) {
      const customer = validateCustomer(item, context.organizationId, previousCode);
      if (seenIds.has(customer.id)) throw new Error("Customer ID duplicated across pages.");
      seenIds.add(customer.id);
      previousCode = customer.code;
      customers.push(customer);
    }
    if (raw.length < pageSize) {
      await requireIsolatedReceivablesSession(context);
      return { customers, sourceComplete: false, endReached: true };
    }
  }
  throw new Error("Customer listing exceeds safe page limit; no partial list returned.");
}
