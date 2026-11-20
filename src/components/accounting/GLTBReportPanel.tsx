import type { GeneralLedgerRead } from "../../accounting/verifiedGeneralLedger";
import type { VerifiedTrialBalance } from "../../accounting/verifiedTrialBalance";
import { formatExactCurrencyMinor } from "../../accounting/formatExactCurrencyMinor";

type Props={currency:string;report:GeneralLedgerRead|VerifiedTrialBalance;mode:"gl"|"tb"};

function signed(value:string,currency:string):string{
  return value.startsWith("-")
    ? "-"+formatExactCurrencyMinor(value.slice(1),currency)
    : formatExactCurrencyMinor(value,currency);
}
export function GLTBReportPanel({currency,report,mode}:Props){
  return <section aria-label={mode==="gl"?"Verified general ledger":"Verified trial balance"}
    className="space-y-4">
    <p role="status" className="rounded-lg border border-border-standard p-3 text-xs text-text-muted">
      Certified V2-only books. Legacy balances and verified opening migration are excluded.
      No bank clearance, financial statement or complete historic economic books implied.
      Source token: <code className="break-all">{report.source.snapshot_token}</code>.
    </p>
    {mode==="gl"?"account" in report&&(
      <>
        <div className="rounded-xl border border-border-standard bg-surface-bright p-4">
          <h2 className="font-semibold">{report.account.code} · {report.account.name}</h2>
          <p className="mt-2 text-sm">Opening: {signed(report.openingMinor,currency)}</p>
          <p className="text-sm">Debit: {signed(report.debitMinor,currency)}
            {" · "}Credit: {signed(report.creditMinor,currency)}</p>
          <p className="font-semibold">Closing: {signed(report.closingMinor,currency)}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border-standard bg-surface-bright">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="p-3 text-left font-semibold">
              Verified general ledger · {report.rows.length} source-backed lines
            </caption>
            <thead className="border-y border-border-standard bg-surface-container-low">
              <tr>
                <th scope="col" className="p-3">Business date</th>
                <th scope="col" className="p-3">Source</th>
                <th scope="col" className="p-3">Debit</th>
                <th scope="col" className="p-3">Credit</th>
                <th scope="col" className="p-3">Running balance</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map(row=>(
                <tr key={`${row.journal_id}:${row.line_no}`}
                  className="border-b border-border-standard">
                  <td className="p-3">{row.business_date}</td>
                  <td className="p-3 text-xs">
                    {row.source_kind??"General posting"}
                    <div className="break-all font-mono text-text-muted">
                      {row.source_id??row.journal_id}
                    </div>
                  </td>
                  <td className="p-3">{signed(row.debit_minor,currency)}</td>
                  <td className="p-3">{signed(row.credit_minor,currency)}</td>
                  <td className="p-3 font-semibold">{signed(row.running_balance_minor,currency)}</td>
                </tr>
              ))}
              {report.rows.length===0&&(
                <tr><td colSpan={5} className="p-4 text-text-muted">No V2 ledger movements in this date range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    ):mode==="tb"&&"totals" in report&&(
      <div className="overflow-x-auto rounded-xl border border-border-standard bg-surface-bright">
        <table className="w-full min-w-[680px] text-left text-sm">
          <caption className="p-3 text-left font-semibold">
            Certified V2 Trial Balance · {report.rows.length} posting accounts
          </caption>
          <thead className="border-y border-border-standard bg-surface-container-low">
            <tr><th scope="col" className="p-3">Account</th>
              <th scope="col" className="p-3">Debit movement</th>
              <th scope="col" className="p-3">Credit movement</th>
              <th scope="col" className="p-3">Closing debit</th>
              <th scope="col" className="p-3">Closing credit</th></tr>
          </thead>
          <tbody>
            {report.rows.map(row=>(
              <tr key={row.account.id} className="border-b border-border-standard">
                <td className="p-3">{row.account.code} · {row.account.name}</td>
                <td className="p-3">{signed(row.debit_minor,currency)}</td>
                <td className="p-3">{signed(row.credit_minor,currency)}</td>
                <td className="p-3">{signed(row.closing_debit_minor,currency)}</td>
                <td className="p-3">{signed(row.closing_credit_minor,currency)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border-standard font-bold">
              <th scope="row" className="p-3">Certified totals</th>
              <td className="p-3">{signed(report.totals.debit_minor,currency)}</td>
              <td className="p-3">{signed(report.totals.credit_minor,currency)}</td>
              <td className="p-3">{signed(report.totals.closing_debit_minor,currency)}</td>
              <td className="p-3">{signed(report.totals.closing_credit_minor,currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )}
  </section>;
}
