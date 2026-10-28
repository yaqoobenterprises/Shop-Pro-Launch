import React from "react";
import { Transaction } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { formatKarachiTime } from "../../lib/dates";
import { formatBusinessDateTime } from "../../regional/format";
import { formatDate } from "../../lib/utils";

interface TransactionPrintReceiptProps {
  transaction: Transaction;
  typeLabel: string;
  isExpense: boolean;
  isVoided: boolean;
  receiptDescription: string;
}

export const TransactionPrintReceipt: React.FC<TransactionPrintReceiptProps> = ({
  transaction,
  typeLabel,
  isExpense,
  isVoided,
  receiptDescription,
}) => (
  <>
  <style>{`
    .transaction-receipt-print { display: none; }
    @media print {
      @page { margin: 12mm; }
      body * { visibility: hidden !important; }
      .transaction-receipt-print,
      .transaction-receipt-print * { visibility: visible !important; }
      .transaction-receipt-print {
        display: block !important;
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        padding: 24px !important;
        box-sizing: border-box !important;
        background: #fff !important;
        color: #111 !important;
        z-index: 999999 !important;
      }
      .transaction-receipt-print .receipt-rule {
        border-bottom: 1px dashed #bbb !important;
      }
    }
  `}</style>
  <div className="transaction-receipt-print" aria-hidden="true">
    <div style={{ maxWidth: 640, margin: "0 auto", fontFamily: "Arial, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
      <header style={{ textAlign: "center", paddingBottom: 16, marginBottom: 16, borderBottom: "2px solid #222" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Shop Pro</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14 }}>Transaction Receipt</p>
        <p style={{ margin: "4px 0 0", fontSize: 11 }}>Receipt ID: {transaction.id}</p>
      </header>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: "#555" }}>CATEGORY</p>
          <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700 }}>{transaction.category_name || typeLabel}</p>
          <p style={{ margin: "2px 0 0" }}>{typeLabel} · {isVoided ? "Voided" : "Active"}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555" }}>AMOUNT</p>
          <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 700 }}>{isExpense ? "−" : ""}{formatPaisa(transaction.amount_paisa)}</p>
        </div>
      </div>
      <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Date</span><strong>{transaction.business_date}</strong>
      </div>
      <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Time</span><strong>{formatKarachiTime(transaction.device_entry_time)} ({formatDate(transaction.device_entry_time)})</strong>
      </div>
      <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Account</span><strong>{transaction.account_name || "Cash In Hand"}</strong>
      </div>
      <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span>Entered by</span><strong>{transaction.created_by_name || "Staff Member"}</strong>
      </div>
      <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb" }}>
        <p style={{ margin: 0, fontSize: 11, color: "#555" }}>DESCRIPTION</p>
        <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{receiptDescription}</p>
      </div>
      {transaction.note && (
        <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555" }}>REMARKS / NOTES</p>
          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{transaction.note}</p>
        </div>
      )}
      {isVoided && transaction.void_reason && (
        <div className="receipt-rule" style={{ padding: "10px 0", borderBottom: "1px dashed #bbb" }}>
          <strong>Void reason:</strong> {transaction.void_reason}
        </div>
      )}
      <footer style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #bbb", fontSize: 10, color: "#555", overflowWrap: "anywhere" }}>
        <p style={{ margin: "2px 0" }}>Transaction ID: {transaction.id}</p>
        {transaction.created_at && <p style={{ margin: "2px 0" }}>Recorded: {formatBusinessDateTime(transaction.created_at)}</p>}
        {transaction.updated_at && <p style={{ margin: "2px 0" }}>Last updated: {formatBusinessDateTime(transaction.updated_at)}</p>}
        <p style={{ margin: "12px 0 0", textAlign: "center" }}>Thank you</p>
      </footer>
    </div>
  </div>
  </>
);
