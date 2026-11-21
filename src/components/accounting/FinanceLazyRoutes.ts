import { lazy } from "react";

/** Split lazy routes keep the App shell within its strict component size budget. */
export const ReceivablesWorkspace = lazy(() =>
  import("./ReceivablesWorkspace").then(m=>({default:m.ReceivablesWorkspace})));
export const SalesDraftsWorkspace = lazy(() =>
  import("./SalesDraftsWorkspace").then(m=>({default:m.SalesDraftsWorkspace})));
export const GeneralLedgerTrialBalanceWorkspace = lazy(() =>
  import("./GeneralLedgerTrialBalanceWorkspace").then(
    m=>({default:m.GeneralLedgerTrialBalanceWorkspace})));
export const SalesInvoiceLifecycleWorkspace = lazy(() =>
  import("./SalesInvoiceLifecycleWorkspace").then(m=>({default:m.SalesInvoiceLifecycleWorkspace})));
export const CashCollectionWorkspace = lazy(() =>
  import("./CashCollectionWorkspace").then(m=>({default:m.CashCollectionWorkspace})));

export const CustomerReceiptDraftWorkspace = lazy(() =>
  import("./CustomerReceiptDraftWorkspace").then(m=>({default:m.CustomerReceiptDraftWorkspace})));
