import React from "react";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import type { DailySummary } from "../../types/ledger";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import { useI18n } from "../../i18n";
interface Props { summary: DailySummary; unavailable?: boolean; onOpenInstallHelp?: () => void }
export const TodayStrip: React.FC<Props> = ({ summary, unavailable }) => {
  const { t } = useI18n();
  const metrics = [
    { label: t("dashboard.income"), value: summary.income_paisa, Icon: ArrowDownLeft, tone: "income" },
    { label: t("dashboard.expenses"), value: summary.expense_paisa, Icon: ArrowUpRight, tone: "expense" },
    { label: t("dashboard.netProfit"), value: summary.net_profit_paisa, Icon: TrendingUp, tone: "result" },
  ];
  return <section className="cashbook-summary">
    <div className="cashbook-summary__header"><div><h1>{t("nav.ledger")}</h1><p>Today · {formatDisplayDate(getKarachiBusinessDate())}</p></div><span className="cashbook-entry-count">{summary.transaction_count} entries</span></div>
    {summary.is_partial && <p role="status" className="sp-comparison-note">Device totals · Cloud history is unavailable.</p>}
    <div className="cashbook-summary__metrics">{metrics.map(({ label, value, Icon, tone }) => <article key={tone} className={`summary-metric summary-metric--${tone}`}><span className="summary-metric__label">{label}<Icon size={18} aria-hidden="true" /></span><strong className="summary-metric__value num">{unavailable ? "Unavailable" : <AnimatedAmount amountPaisa={value} />}</strong></article>)}</div>
  </section>;
};
