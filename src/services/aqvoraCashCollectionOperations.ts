/**
 * An operational controlled-cash claim, NOT a journal posting or bank deposit.
 * Kept disabled in all normal builds; SQL still owns all AAL2/tenant/policy checks.
 */
import type {
  CashCollection, ConfirmCashCollectionRequest, CreateCashCollectionRequest,
} from "../accounting/receiptContracts";
import {
  verifyControlledCashCollection, type VerifiedCashEvidence,
} from "../accounting/verifiedCashCollection";
import { date, money, uuid } from "../accounting/receiptReadPrimitives";
import { getSupabaseClient } from "../lib/supabase";
import {
  isIsolatedReceivablesReadEnabled, requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";
import { loadIsolatedCashCollection } from "./aqvoraCashReceiptReadService";

export const isIsolatedCashCollectionEnabled = (): boolean =>
  isIsolatedReceivablesReadEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS === "true";

function checkSource(
  raw: unknown, context: IsolatedReceivablesContext, id: string,
): VerifiedCashEvidence {
  return verifyControlledCashCollection(raw, { ...context, collectionId:id });
}
async function cashRpc(
  context: IsolatedReceivablesContext,
  method: "create_aqvora_cash_collection" | "confirm_aqvora_cash_collection" |
    "cancel_aqvora_cash_collection",
  args:Record<string,unknown>,
):Promise<unknown> {
  if (!isIsolatedCashCollectionEnabled()) {
    throw new Error("Controlled-cash workflow disabled outside isolated staging.");
  }
  await requireIsolatedReceivablesSession(context);
  const { data, error } = await getSupabaseClient().rpc(method, args);
  if (error) throw error;
  await requireIsolatedReceivablesSession(context);
  return data;
}
function validAmount(value:unknown,positive=false):bigint {
  const result=money(value,"controlled cash amount",true);
  if (positive&&result===0n)throw new Error("Cash amount must be positive.");
  return result;
}
function validIntent(value:unknown):void {
  if(typeof value!=="string" || !value.trim() || value.trim()!==value ||
     value.length>100)throw new Error("Invalid controlled-cash creation intent.");
}

/** Exact retry with original intent can return a previously confirmed source. */
export async function createIsolatedCashCollection(
  context:IsolatedReceivablesContext,
  request:CreateCashCollectionRequest,
):Promise<VerifiedCashEvidence> {
  if(request.p_organization_id!==context.organizationId ||
     request.p_currency!==context.currency ||
     request.p_source_kind!=="controlled_cash" ||
     date(request.p_business_date,"cash business")>context.asOfDate) {
    throw new Error("Controlled-cash source company, type, date or currency mismatch.");
  }
  uuid(request.p_customer_id,"cash customer");
  validIntent(request.p_intent_key);
  validAmount(request.p_amount_minor,true);
  const raw=await cashRpc(context,"create_aqvora_cash_collection",{...request});
  if(!raw||typeof raw!=="object"||Array.isArray(raw)){
    throw new Error("Missing authoritative cash creation response.");
  }
  const saved=raw as CashCollection;
  uuid(saved.id,"created cash collection");
  const result=checkSource(raw,context,saved.id);
  if(saved.organization_id!==context.organizationId ||
     saved.creation_intent!==request.p_intent_key ||
     saved.customer_id!==request.p_customer_id ||
     saved.business_date!==request.p_business_date ||
     saved.currency!==request.p_currency ||
     saved.amount_minor!==request.p_amount_minor ||
     saved.created_by!==context.userId) {
    throw new Error("Cash source does not match the original actor/intent/amount.");
  }
  return result;
}

/** Confirmation is a *second-person manual cash count*, never bank clearing. */
export async function confirmIsolatedCashCollection(
  context:IsolatedReceivablesContext,
  source:CashCollection,
  request:ConfirmCashCollectionRequest,
  actorRole:string,
):Promise<VerifiedCashEvidence> {
  if(actorRole!=="OWNER" || source.created_by===context.userId ||
     source.state!=="draft" || request.p_collection_id!==source.id ||
     request.p_organization_id!==context.organizationId ||
     request.p_expected_revision!==source.revision ||
     request.p_attestation!=="cash_counted_in_person" ||
     request.p_counted_minor!==source.amount_minor) {
    throw new Error("Cash requires independent OWNER and exact counted source.");
  }
  uuid(source.id,"cash claim");
  const raw=await cashRpc(context,"confirm_aqvora_cash_collection",{...request});
  const result=checkSource(raw,context,source.id);
  if(result.collection.state!=="confirmed" ||
     result.attestation!=="dual_control" ||
     result.collection.confirmed_by!==context.userId ||
     BigInt(result.collection.revision)!==BigInt(source.revision)+1n ||
     result.collection.amount_minor!==source.amount_minor ||
     result.collection.customer_id!==source.customer_id ||
     result.collection.business_date!==source.business_date) {
    throw new Error("Confirmed cash revision/actor/source does not reconcile.");
  }
  return result;
}

/** Only unconfirmed claims may be cancelled; no delete or reversal. */
export async function cancelIsolatedCashCollection(
  context:IsolatedReceivablesContext,
  source:CashCollection, reason:string, actorRole:string,
):Promise<VerifiedCashEvidence> {
  if(source.state!=="draft" || source.organization_id!==context.organizationId ||
     source.created_by!==context.userId && actorRole!=="OWNER" ||
     !reason.trim() || reason!==reason.trim() || reason.length>500) {
    throw new Error("Cash cancellation needs a valid draft, actor and reason.");
  }
  uuid(source.id,"cash claim");
  const raw=await cashRpc(context,"cancel_aqvora_cash_collection",{
    p_organization_id:context.organizationId,p_collection_id:source.id,
    p_expected_revision:source.revision,p_reason:reason,
  });
  const result=checkSource(raw,context,source.id);
  if(result.collection.state!=="cancelled" ||
      result.collection.cancel_reason!==reason ||
      BigInt(result.collection.revision)!==BigInt(source.revision)+1n) {
    throw new Error("Cash cancellation response does not match immutable audit reason.");
  }
  return result;
}

/** UI deliberately has no mutation shortcut: read current SQL-owned source first. */
export async function loadCurrentIsolatedCash(
  context:IsolatedReceivablesContext, id:string,
):Promise<VerifiedCashEvidence> {
  if(!isIsolatedCashCollectionEnabled()) {
    throw new Error("Controlled-cash workflow disabled outside isolated staging.");
  }
  return loadIsolatedCashCollection(context,id);
}
