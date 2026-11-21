import React from "react";

function safeInlineMarkdown(value: string): React.ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCurrency(value: string): bigint | null {
  const cleaned = value.replace(/,/g, "").replace(/\s/g, "").replace(/^Rs\.?/i, "");
  const match = cleaned.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = BigInt((match[3] || "").padEnd(2, "0") || "0");
  const amount = BigInt(match[2]) * 100n + cents;
  return match[1] ? -amount : amount;
}

function barWidth(value: bigint | null, max: bigint): string {
  if (value === null || max <= 0n) return "0%";
  const absolute = value < 0n ? -value : value;
  const basis = Number((absolute * 10000n) / max) / 100;
  return `${Math.min(100, basis)}%`;
}

function plainFinancialTable(headers: string[], rows: string[][], key: string): React.ReactNode {
  return <div className="lm-table-wrap" key={key}><table><thead><tr>{headers.map((cell, i) => <th key={i}>{safeInlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{safeInlineMarkdown(row[j] || "")}</td>)}</tr>)}</tbody></table></div>;
}

function renderFinancialTable(headers: string[], rows: string[][], key: string): React.ReactNode {
  const normalized = headers.map(normalizedHeader);
  const metricIndex = normalized.findIndex((header) => /^(metric|hisab|detail|ØªÙØµÛŒÙ„)$/.test(header));
  const amountIndex = normalized.findIndex((header) => /^(amount|raqam|Ø±Ù‚Ù…)$/.test(header));
  if (metricIndex >= 0 && amountIndex >= 0) {
    return <section className="lm-report-cards" aria-label="Verified Shop Pro summary" key={key}>
      {rows.map((row, index) => <article className="lm-report-card" key={index}>
        <span>{safeInlineMarkdown(row[metricIndex] || "")}</span>
        <strong>{safeInlineMarkdown(row[amountIndex] || "")}</strong>
      </article>)}
    </section>;
  }

  const categoryIndex = normalized.findIndex((header) => /^(category|service category|service|Ú©ÛŒÙ¹ÛŒÚ¯Ø±ÛŒ|Ø³Ø±ÙˆØ³ Ú©ÛŒÙ¹ÛŒÚ¯Ø±ÛŒ)$/.test(header));
  const transactionIndex = normalized.findIndex((header) => /^(transactions|entries|Ø§Ù†Ø¯Ø±Ø§Ø¬Ø§Øª|Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø²)$/.test(header));
  if (categoryIndex >= 0 && amountIndex >= 0 && transactionIndex >= 0) {
    const amounts = rows.map((row) => parseCurrency(row[amountIndex] || "")).filter((value): value is bigint => value !== null);
    const max = amounts.reduce((largest, value) => value > largest ? value : largest, 0n);
    return <section className="lm-chart-card" aria-label="Income by Shop Pro category" key={key}>
      <ol className="lm-bar-chart">
        {rows.map((row, index) => {
          const value = parseCurrency(row[amountIndex] || "");
          return <li className="lm-bar-item" key={index}>
            <div className="lm-bar-label"><strong>{safeInlineMarkdown(row[categoryIndex] || "")}</strong><span>{safeInlineMarkdown(row[amountIndex] || "")} Â· {safeInlineMarkdown(row[transactionIndex] || "0")}</span></div>
            <div className="lm-bar-track"><span className="lm-bar-fill" style={{ width: barWidth(value, max) }} /></div>
          </li>;
        })}
      </ol>
      <details className="lm-chart-data"><summary>View data table</summary>{plainFinancialTable(headers, rows, `${key}-data`)}</details>
    </section>;
  }

  const periodIndex = normalized.findIndex((header) => /^(period|muddat|Ù…Ø¯Øª)$/.test(header));
  const incomeIndex = normalized.findIndex((header) => /income|sales|Ø¢Ù…Ø¯Ù†ÛŒ|ÙØ±ÙˆØ®Øª/.test(header));
  const expenseIndex = normalized.findIndex((header) => /expense|kharch|Ø§Ø®Ø±Ø§Ø¬Ø§Øª/.test(header));
  if (periodIndex >= 0 && incomeIndex >= 0 && expenseIndex >= 0) {
    const values = rows.flatMap((row) => [parseCurrency(row[incomeIndex] || ""), parseCurrency(row[expenseIndex] || "")])
      .filter((value): value is bigint => value !== null);
    const max = values.reduce((largest, value) => {
      const absolute = value < 0n ? -value : value;
      return absolute > largest ? absolute : largest;
    }, 0n);
    return <section className="lm-chart-card" aria-label="Income and expenses by period" key={key}>
      <div className="lm-chart-legend"><span><i className="income" />Income</span><span><i className="expense" />Expenses</span></div>
      <ol className="lm-period-chart">
        {rows.map((row, index) => {
          const income = parseCurrency(row[incomeIndex] || "");
          const expense = parseCurrency(row[expenseIndex] || "");
          return <li key={index}>
            <strong>{safeInlineMarkdown(row[periodIndex] || "")}</strong>
            <div className="lm-period-series"><span>Income <b>{safeInlineMarkdown(row[incomeIndex] || "")}</b></span><div className="lm-bar-track"><i className="lm-bar-fill income" style={{ width: barWidth(income, max) }} /></div></div>
            <div className="lm-period-series"><span>Expenses <b>{safeInlineMarkdown(row[expenseIndex] || "")}</b></span><div className="lm-bar-track"><i className="lm-bar-fill expense" style={{ width: barWidth(expense, max) }} /></div></div>
          </li>;
        })}
      </ol>
      <details className="lm-chart-data"><summary>View data table</summary>{plainFinancialTable(headers, rows, `${key}-data`)}</details>
    </section>;
  }

  return plainFinancialTable(headers, rows, key);
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
      blocks.push(<Tag key={index}>{safeInlineMarkdown(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const parseCells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = parseCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(parseCells(lines[index++]));
      blocks.push(renderFinancialTable(headers, rows, `table-${index}`));
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, i) => <li key={i}>{safeInlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, i) => <li key={i}>{safeInlineMarkdown(item)}</li>)}</ol>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*+]\s+/.test(lines[index]) && !/^\s*\d+[.)]\s+/.test(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(<p key={`p-${index}`}>{safeInlineMarkdown(paragraph.join(" "))}</p>);
  }
  return <div className="lm-markdown">{blocks}</div>;
}
