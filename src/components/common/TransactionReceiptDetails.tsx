import React from "react";
import { Transaction } from "../../types/ledger";
import { formatKarachiTime } from "../../lib/dates";
import { formatDate } from "../../lib/utils";
import { useI18n } from "../../i18n";
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Tag,
  User,
} from "lucide-react";

interface TransactionReceiptDetailsProps {
  transaction: Transaction;
}

export const TransactionReceiptDetails: React.FC<TransactionReceiptDetailsProps> = ({
  transaction,
}) => {
  const { t } = useI18n();

  return (
    <>
  {/* Core Financial & Account Info */}
  <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-standard bg-surface-container-low/40 p-4 sm:grid-cols-2">
    <div className="flex items-start gap-2.5">
      <CreditCard className="mt-0.5 h-4 w-4 text-secondary shrink-0" />
      <div>
        <p className="text-[11px] font-medium text-text-muted">{t("transaction.account")}</p>
        <p className="text-sm font-semibold text-on-surface">
          {transaction.account_name || "Cash In Hand"}
        </p>
      </div>
    </div>
  
    <div className="flex items-start gap-2.5">
      <Calendar className="mt-0.5 h-4 w-4 text-secondary shrink-0" />
      <div>
        <p className="text-[11px] font-medium text-text-muted">{t("transaction.businessDateLabel")}</p>
        <p className="text-sm font-semibold text-on-surface font-mono">
          {transaction.business_date}
        </p>
      </div>
    </div>
  
    <div className="flex items-start gap-2.5">
      <Clock className="mt-0.5 h-4 w-4 text-secondary shrink-0" />
      <div>
        <p className="text-[11px] font-medium text-text-muted">{t("transaction.deviceTime")}</p>
        <p className="text-sm font-semibold text-on-surface">
          {formatKarachiTime(transaction.device_entry_time)}
          <span className="ml-1 text-[11px] font-normal text-text-muted">
            ({formatDate(transaction.device_entry_time)})
          </span>
        </p>
      </div>
    </div>
  
    <div className="flex items-start gap-2.5">
      <User className="mt-0.5 h-4 w-4 text-secondary shrink-0" />
      <div>
        <p className="text-[11px] font-medium text-text-muted">{t("transaction.recordedBy")}</p>
        <p className="text-sm font-semibold text-on-surface">
          {transaction.created_by_name || "Staff Member"}
        </p>
      </div>
    </div>
  </div>
  
  {/* Original Entry & Notes */}
  {(transaction.raw_text || transaction.note) && (
    <div className="space-y-3 rounded-xl border border-border-standard bg-surface-container-low/40 p-4">
      {transaction.raw_text && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
            <FileText className="h-3.5 w-3.5 text-secondary" />
            Original Input Text
          </p>
          <p className="mt-1 rounded-md bg-surface-bright border border-border-standard px-3 py-2 text-xs font-mono text-on-surface">
            {transaction.raw_text}
          </p>
        </div>
      )}
  
      {transaction.note && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
            <Tag className="h-3.5 w-3.5 text-secondary" />
            Remarks / Notes
          </p>
          <p className="mt-1 text-xs text-on-surface">
            {transaction.note}
          </p>
        </div>
      )}
    </div>
  )}
    </>
  );
};
