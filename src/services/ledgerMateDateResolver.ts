export interface LedgerMatePeriod {
  kind: "day" | "month" | "year";
  startDate: string;
  endDate: string;
  label: string;
}

export interface LedgerMatePeriodResolution {
  periods: LedgerMatePeriod[];
  inheritedFromHistory: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function makePeriod(year: number, month?: number, day?: number): LedgerMatePeriod | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (day !== undefined && month !== undefined) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { kind: "day", startDate: value, endDate: value, label: value };
  }
  if (month !== undefined) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      kind: "month",
      startDate,
      endDate: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      label: `${year}-${String(month).padStart(2, "0")}`,
    };
  }
  return { kind: "year", startDate: `${year}-01-01`, endDate: `${year}-12-31`, label: String(year) };
}

function shiftMonth(date: string, offset: number): LedgerMatePeriod {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return makePeriod(value.getUTCFullYear(), value.getUTCMonth() + 1)!;
}

function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function explicitPeriod(question: string, currentDate: string): LedgerMatePeriod | null {
  const text = question.toLowerCase();
  const currentYear = Number(currentDate.slice(0, 4));

  if (/\b(today|aaj|aj)\b/.test(text)) {
    return makePeriod(currentYear, Number(currentDate.slice(5, 7)), Number(currentDate.slice(8, 10)));
  }
  if (/\b(yesterday|kal|guzishta kal)\b/.test(text)) {
    const yesterday = shiftDate(currentDate, -1);
    return makePeriod(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)), Number(yesterday.slice(8, 10)));
  }

  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if (iso) return makePeriod(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/\b([0-2]?\d|3[01])[-/.]([01]?\d)[-/.](20\d{2})\b/);
  if (numeric) return makePeriod(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const namedDate = text.match(/\b([0-2]?\d|3[01])\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\.?[,]?\s+(20\d{2}))?\b/);
  if (namedDate) {
    const month = MONTHS[namedDate[2]];
    return makePeriod(Number(namedDate[3] || currentYear), month, Number(namedDate[1]));
  }

  const mdyDate = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-2]?\d|3[01])(?:[,]?\s+(20\d{2}))?\b/);
  if (mdyDate) {
    const month = MONTHS[mdyDate[1]];
    return makePeriod(Number(mdyDate[3] || currentYear), month, Number(mdyDate[2]));
  }

  const namedMonth = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b/);
  if (namedMonth) return makePeriod(Number(namedMonth[2]), MONTHS[namedMonth[1]]);

  const previousMonth = /\b(last month|previous month|pichl(?:e|ay) mah(?:i|e)ne|guzishta mah(?:i|e)ne)\b/.test(text);
  if (previousMonth) return shiftMonth(currentDate, -1);
  if (/\b(this month|current month|is month|iss month|is mah(?:i|e)ne|iss mah(?:i|e)ne|aaj kal is mah(?:i|e)ne)\b/.test(text)) {
    return makePeriod(currentYear, Number(currentDate.slice(5, 7)));
  }

  if (/\b(last year|previous year|pichl(?:e|ay) saal|guzishta saal)\b/.test(text)) {
    return makePeriod(currentYear - 1);
  }
  if (/\b(this year|current year|is saal|iss saal)\b/.test(text)) return makePeriod(currentYear);

  const year = text.match(/\b(20\d{2})\b/);
  if (year && /\b(year|saal|annual|yearly)\b/.test(text)) return makePeriod(Number(year[1]));
  return null;
}

function isComparison(question: string): boolean {
  return /\b(compare|comparison|compared|versus|vs\.?|increase|increased|decrease|difference|muqabla|farq|kitn[ai] barh|barh[ai])\b/i.test(question);
}

function hasCurrentMonthReference(question: string): boolean {
  return /\b(this month|current month|is month|iss month|is mah(?:i|e)ne|iss mah(?:i|e)ne)\b/i.test(question);
}

function hasPreviousMonthReference(question: string): boolean {
  return /\b(last month|previous month|pichl(?:e|ay) mah(?:i|e)ne|guzishta mah(?:i|e)ne)\b/i.test(question);
}

function hasCurrentYearReference(question: string): boolean {
  return /\b(this year|current year|is saal|iss saal)\b/i.test(question);
}

function hasPreviousYearReference(question: string): boolean {
  return /\b(last year|previous year|pichl(?:e|ay) saal|guzishta saal)\b/i.test(question);
}

function findPreviousPeriod(messages: Array<{ role: string; content: string }>, currentDate: string): LedgerMatePeriod | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const period = explicitPeriod(message.content, currentDate);
    if (period) return period;
  }
  return null;
}

export function resolveLedgerMatePeriods(
  question: string,
  previousMessages: Array<{ role: string; content: string }>,
  currentDate: string,
): LedgerMatePeriodResolution {
  const current = explicitPeriod(question, currentDate);
  const prior = findPreviousPeriod(previousMessages, currentDate);

  if (isComparison(question)) {
    const currentMonth = makePeriod(Number(currentDate.slice(0, 4)), Number(currentDate.slice(5, 7)))!;
    const currentYear = makePeriod(Number(currentDate.slice(0, 4)))!;
    if (hasPreviousMonthReference(question)) {
      return { periods: [shiftMonth(currentDate, -1), currentMonth], inheritedFromHistory: false };
    }
    if (hasPreviousYearReference(question)) {
      return { periods: [makePeriod(Number(currentDate.slice(0, 4)) - 1)!, currentYear], inheritedFromHistory: false };
    }
    if (hasCurrentMonthReference(question) && prior && prior.kind === "day") {
      return { periods: [prior, currentMonth], inheritedFromHistory: true };
    }
    if (hasCurrentYearReference(question)) {
      const previousYear = prior?.kind === "year" ? prior : null;
      return {
        periods: [previousYear || makePeriod(Number(currentDate.slice(0, 4)) - 1)!, currentYear],
        inheritedFromHistory: Boolean(previousYear),
      };
    }
    if (current && prior && (current.startDate !== prior.startDate || current.endDate !== prior.endDate)) {
      return { periods: [prior, current], inheritedFromHistory: false };
    }
  }

  if (current) return { periods: [current], inheritedFromHistory: false };
  if (prior && /\b(and|also|aur|bhi|us din|that day|same date|iska|uska)\b/i.test(question)) {
    return { periods: [prior], inheritedFromHistory: true };
  }
  if (prior && question.trim().split(/\s+/).length <= 6 && !/\b(month|year|saal|mah(?:i|e)na)\b/i.test(question)) {
    return { periods: [prior], inheritedFromHistory: true };
  }
  return { periods: [], inheritedFromHistory: false };
}
