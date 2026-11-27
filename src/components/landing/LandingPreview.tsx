import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  MoreHorizontal,
  ReceiptText,
  Wallet,
} from "lucide-react";

const MONTHS = [
  { month: "May", income: 82000, expense: 52000 },
  { month: "Jun", income: 96000, expense: 61000 },
  { month: "Jul", income: 105000, expense: 77000 },
  { month: "Aug", income: 117000, expense: 72000 },
  { month: "Sep", income: 108000, expense: 80000 },
  { month: "Oct", income: 144000, expense: 95000 },
] as const;

const formatSample = (amount: number) =>
  "Rs " + new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(amount);

/** A clearly marked illustrative interface, never connected to customer data. */
export const LandingPreview: React.FC = () => (
  <section className="aq-preview" aria-label="Sample accounting workspace">
    <div className="aq-preview__top">
      <div className="aq-preview__identity">
        <span className="aq-preview__company-icon"><Building2 size={17} aria-hidden="true" /></span>
        <div>
          <strong>Acme Trading Co.</strong>
          <span>Overview · October</span>
        </div>
      </div>
      <span className="aq-preview__sample">Sample data</span>
    </div>

    <div className="aq-preview__body">
      <div className="aq-preview__section-title">
        <div>
          <h2>Overview</h2>
        </div>
        <span className="aq-preview__more" aria-hidden="true"><MoreHorizontal size={18} /></span>
      </div>

      <div className="aq-preview__metrics">
        <article className="aq-preview__metric aq-preview__metric--primary">
          <div className="aq-preview__metric-label"><span>Cash & bank</span><Wallet size={15} aria-hidden="true" /></div>
          <strong>{formatSample(268400)}</strong>
          <small>Illustrative balance</small>
        </article>
        <article className="aq-preview__metric">
          <div className="aq-preview__metric-label"><span>Operating result</span><ArrowUpRight size={15} aria-hidden="true" /></div>
          <strong>{formatSample(49000)}</strong>
          <small>Income less expenses</small>
        </article>
      </div>

      <div className="aq-preview__chart-panel">
        <div className="aq-preview__chart-heading">
          <div>
            <h3>Income & expenses</h3>
            <span>Sample monthly cashbook activity</span>
          </div>
          <span className="aq-preview__chart-icon"><BarChart3 size={17} aria-hidden="true" /></span>
        </div>
        <div className="aq-preview__legend" aria-hidden="true">
          <span><i className="aq-preview__legend-income" /> Income</span>
          <span><i className="aq-preview__legend-expense" /> Expenses</span>
        </div>
        <div className="aq-preview__plot" aria-hidden="true">
          {MONTHS.map((item) => (
            <div className="aq-preview__group" key={item.month}>
              <div className="aq-preview__bars">
                <span className="aq-preview__bar aq-preview__bar--income" style={{ height: String(item.income / 1600) + "%" }} />
                <span className="aq-preview__bar aq-preview__bar--expense" style={{ height: String(item.expense / 1600) + "%" }} />
              </div>
              <span className="aq-preview__month">{item.month}</span>
            </div>
          ))}
        </div>
        <table className="sr-only">
          <caption>Illustrative monthly income and expense amounts in Pakistani rupees</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expenses</th></tr></thead>
          <tbody>
            {MONTHS.map((item) => (
              <tr key={item.month}>
                <th scope="row">{item.month}</th>
                <td>{formatSample(item.income)}</td>
                <td>{formatSample(item.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="aq-preview__recent">
        <div className="aq-preview__recent-heading">
          <h3>Recent activity</h3>
          <span>Sample entries</span>
        </div>
        <div className="aq-preview__transaction">
          <span className="aq-preview__tx-icon aq-preview__tx-icon--income"><ArrowDownLeft size={15} aria-hidden="true" /></span>
          <span className="aq-preview__tx-label">Customer payment<small>Cash account</small></span>
          <strong className="aq-preview__tx-positive">+{formatSample(18500)}</strong>
        </div>
        <div className="aq-preview__transaction">
          <span className="aq-preview__tx-icon aq-preview__tx-icon--expense"><ArrowUpRight size={15} aria-hidden="true" /></span>
          <span className="aq-preview__tx-label">Office supplies<small>Cash account</small></span>
          <strong>−{formatSample(3200)}</strong>
        </div>
      </div>
    </div>
    <div className="aq-preview__bottom"><ReceiptText size={14} aria-hidden="true" /> Illustration only · no live transactions</div>
  </section>
);
