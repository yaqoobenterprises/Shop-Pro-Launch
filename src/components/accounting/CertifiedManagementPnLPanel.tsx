import type { VerifiedTrialBalance } from "../../accounting/verifiedTrialBalance";
import { deriveCertifiedManagementPnL } from "../../accounting/verifiedManagementPnL";
import { formatCertifiedReportMoney, validateReportCurrencyEvidence }
  from "../../accounting/currencyReportEvidence";

/** No financial writer. The parent service enforces isolated staging + AAL2. */
export function CertifiedManagementPnLPanel({
  report, currency,
}: {report:VerifiedTrialBalance; currency:string}) {
  const pnl = deriveCertifiedManagementPnL(report);
  if (currency !== pnl.currency) throw new Error("P&L currency differs from the selected company.");
  const evidence = validateReportCurrencyEvidence(report.source, {
    organizationId: pnl.organizationId, currency: pnl.currency, asOfDate: pnl.toDate,
  });
  const display = (amount:string) => formatCertifiedReportMoney(amount, currency, evidence);
  const lines = [
    ["Revenue", pnl.revenueMinor],
    ["Cost of sales", pnl.costOfSalesMinor],
    ["Gross profit", pnl.grossProfitMinor],
    ["Operating expenses", pnl.expensesMinor],
    ["Other income", pnl.otherIncomeMinor],
    ["Other expenses", pnl.otherExpensesMinor],
  ] as const;
  return <section aria-label="Certified V2 management Profit and Loss"
    className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Profit & Loss</h2>
      <p className="text-sm text-text-muted">
        {pnl.fromDate} to {pnl.toDate} · {pnl.currency} · verified V2 postings only
      </p>
    </header>
    <p role="status" className="rounded-lg border border-border-standard p-3 text-xs text-text-muted">
      Management review, not an IFRS/GAAP statutory statement. Old Cashbook activity,
      bank reconciliation, tax configuration and unaudited openings are NOT included.
      {evidence?.display_complete===true
        ? " Monetary display follows certified currency policy."
        : " Currency policy evidence is incomplete; values show exact raw minor units."}
      {" "}Source token: <code className="break-all">{pnl.sourceToken}</code>
    </p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {([
        ["Revenue", pnl.revenueMinor],
        ["Gross profit", pnl.grossProfitMinor],
        ["Expenses", (BigInt(pnl.expensesMinor)+BigInt(pnl.otherExpensesMinor)).toString()],
        ["Net earnings", pnl.netEarningsMinor],
      ] as const).map(([label,amount])=>(
        <div key={label} className="rounded-xl border border-border-standard bg-surface-bright p-4">
          <span className="text-xs text-text-muted">{label}</span>
          <strong className="mt-1 block break-words text-lg tabular-nums">{display(amount)}</strong>
        </div>
      ))}
    </div>
    <div className="overflow-x-auto rounded-xl border border-border-standard bg-surface-bright">
      <table className="w-full min-w-[460px] text-left text-sm">
        <caption className="p-3 text-left font-semibold">
          Exact period movement · no prior-period income mixed in
        </caption>
        <thead className="border-y border-border-standard bg-surface-container-low">
          <tr><th scope="col" className="p-3">Statement line</th>
            <th scope="col" className="p-3 text-right">Amount</th></tr>
        </thead>
        <tbody>
          {lines.map(([name,amount])=>(
            <tr key={name} className="border-b border-border-standard">
              <th scope="row" className="p-3 font-medium">{name}</th>
              <td className="p-3 text-right tabular-nums">{display(amount)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border-standard font-bold">
            <th scope="row" className="p-3">Net earnings</th>
            <td className="p-3 text-right tabular-nums">{display(pnl.netEarningsMinor)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>;
}
