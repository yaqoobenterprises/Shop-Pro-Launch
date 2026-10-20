import { Receipt } from "lucide-react";
import { useI18n } from "../../i18n";

export const ChatFeedEmptyState = () => {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container-low text-secondary">
        <Receipt className="h-5 w-5" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-semibold text-on-surface">No entries today</h4>
      <p className="mt-1 text-xs text-text-muted">{t("chat.clearToday")}</p>
    </div>
  );
};
