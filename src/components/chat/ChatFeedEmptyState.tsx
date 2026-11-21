import { ArrowUpRight, ReceiptText } from "lucide-react";
import { useI18n } from "../../i18n";

interface Props {
  onStartEntry?: () => void;
}

/** Compact, accessible empty state inside the same bounded activity surface. */
export const ChatFeedEmptyState = ({ onStartEntry }: Props) => {
  const { t } = useI18n();

  return (
    <div className="cashbook-empty" role="status" aria-label="No cashbook entries today">
      <div className="cashbook-empty__icon">
        <ReceiptText size={23} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div className="cashbook-empty__copy">
        <h3>No entries today</h3>
        <p>{t("chat.clearToday")} Use the entry form below when you are ready.</p>
      </div>
      {onStartEntry && (
        <button type="button" className="cashbook-empty__action" onClick={onStartEntry}>
          Record an entry <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
