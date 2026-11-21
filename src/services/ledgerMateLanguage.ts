export type LedgerMateLanguage = "english" | "roman-urdu" | "urdu";

const ROMAN_URDU_CUES = /\b(aaj|aj|kal|kitna|kitni|kitne|hai|hain|ha|hua|hui|hu|hue|kya|kuch|batao|btao|bata|bta|karo|kro|kar|mein|mera|meri|mere|ka|ki|ke|aur|bhi|kharcha|kharchay|kamai|munafa|hisab|hisaab|saal|mahina|mahine|tha|thi|the|voide|void hui|void hua)\b/i;

export function detectLedgerMateLanguage(text: string): LedgerMateLanguage {
  if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(text)) return "urdu";
  return ROMAN_URDU_CUES.test(text) ? "roman-urdu" : "english";
}

export function getLedgerMateLanguageInstruction(text: string): string {
  switch (detectLedgerMateLanguage(text)) {
    case "roman-urdu":
      return "The latest user message is Roman Urdu. Reply in simple Roman Urdu using Latin letters only. Do not switch to Urdu/Arabic script. Keep Shop Pro labels and currency clear.";
    case "urdu":
      return "The latest user message is written in Urdu script. Reply in Urdu script. Do not switch to Roman Urdu or English except for unavoidable Shop Pro field names.";
    default:
      return "The latest user message is English. Reply in clear English. Do not switch to Urdu or Roman Urdu.";
  }
}

export const LEDGERMATE_COPY = {
  english: {
    verifiedSummary: "Verified Shop Pro summary",
    verifiedVoidActivity: "Verified void activity",
    metric: "Metric",
    amount: "Amount",
    income: "Income / sales recorded",
    expenses: "Expenses",
    net: "Net result (income minus expenses)",
    capital: "Capital received (excluded from income)",
    withdrawals: "Owner withdrawals (excluded from expenses)",
    period: "Period",
    allTime: "All time",
    category: "Category",
    service: "Service category",
    transactions: "Transactions",
    voidedTransactions: "Transactions voided",
    timeOfVoid: "Voided at (PKT)",
    businessDate: "Business date",
    type: "Type",
    reason: "Reason",
    account: "Payment account",
    note: "Note",
    noVoids: "No transactions were voided during this period. Shop Pro returned zero matching records.",
    showing: "Showing",
    of: "of",
    latest: "latest",
    entries: "entries",
    noIncome: "No income entries were recorded in this period.",
    comparison: "Verified period comparison",
  },
  "roman-urdu": {
    verifiedSummary: "Shop Pro ledger ka verified khulasa",
    verifiedVoidActivity: "Ledger se verify shuda void activity",
    metric: "Hisab",
    amount: "Raqam",
    income: "Record shuda income / sales",
    expenses: "Expenses / kharchay",
    net: "Net result (income mein se expenses minus)",
    capital: "Maalik ka jama capital (income mein shamil nahi)",
    withdrawals: "Maalik ki nikasi (expense mein shamil nahi)",
    period: "Muddat",
    allTime: "Ab tak",
    category: "Category",
    service: "Service category",
    transactions: "Transactions",
    voidedTransactions: "Void ki gayi transactions",
    timeOfVoid: "Void ka waqt (PKT)",
    businessDate: "Business date",
    type: "Qisam",
    reason: "Wajah",
    account: "Payment account",
    note: "Note",
    noVoids: "Is muddat mein koi transaction void nahi hui. Shop Pro ledger mein 0 matching records mile.",
    showing: "Dikhai ja rahi hain",
    of: "mein se",
    latest: "aakhri",
    entries: "entries",
    noIncome: "Is muddat mein koi income record nahi hui.",
    comparison: "Ledger ka verified period comparison",
  },
  urdu: {
    verifiedSummary: "Shop Pro ledger Ú©Ø§ ØªØµØ¯ÛŒÙ‚ Ø´Ø¯Û Ø®Ù„Ø§ØµÛ",
    verifiedVoidActivity: "Ledger Ø³Û’ ØªØµØ¯ÛŒÙ‚ Ø´Ø¯Û void activity",
    metric: "ØªÙØµÛŒÙ„",
    amount: "Ø±Ù‚Ù…",
    income: "Ø¯Ø±Ø¬ Ø´Ø¯Û Ø¢Ù…Ø¯Ù†ÛŒ / ÙØ±ÙˆØ®Øª",
    expenses: "Ø§Ø®Ø±Ø§Ø¬Ø§Øª",
    net: "Ø®Ø§Ù„Øµ Ù†ØªÛŒØ¬Û (Ø¢Ù…Ø¯Ù†ÛŒ Ù…Ù†ÙÛŒ Ø§Ø®Ø±Ø§Ø¬Ø§Øª)",
    capital: "Ø¬Ù…Ø¹ Ø´Ø¯Û Ø³Ø±Ù…Ø§ÛŒÛ (Ø¢Ù…Ø¯Ù†ÛŒ Ù…ÛŒÚº Ø´Ø§Ù…Ù„ Ù†ÛÛŒÚº)",
    withdrawals: "Ù…Ø§Ù„Ú© Ú©ÛŒ Ù†Ú©Ø§Ø³ÛŒ (Ø§Ø®Ø±Ø§Ø¬Ø§Øª Ù…ÛŒÚº Ø´Ø§Ù…Ù„ Ù†ÛÛŒÚº)",
    period: "Ù…Ø¯Øª",
    allTime: "Ø§Ø¨ ØªÚ©",
    category: "Ú©ÛŒÙ¹ÛŒÚ¯Ø±ÛŒ",
    service: "Ø³Ø±ÙˆØ³ Ú©ÛŒÙ¹ÛŒÚ¯Ø±ÛŒ",
    transactions: "Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø²",
    voidedTransactions: "void Ú©ÛŒ Ú¯Ø¦ÛŒ Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø²",
    timeOfVoid: "void ÛÙˆÙ†Û’ Ú©Ø§ ÙˆÙ‚Øª (PKT)",
    businessDate: "Ú©Ø§Ø±ÙˆØ¨Ø§Ø±ÛŒ ØªØ§Ø±ÛŒØ®",
    type: "Ù‚Ø³Ù…",
    reason: "ÙˆØ¬Û",
    account: "Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ Ø§Ú©Ø§Ø¤Ù†Ù¹",
    note: "Ù†ÙˆÙ¹",
    noVoids: "Ø§Ø³ Ù…Ø¯Øª Ù…ÛŒÚº Ú©ÙˆØ¦ÛŒ Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù† void Ù†ÛÛŒÚº ÛÙˆØ¦ÛŒÛ” Shop Pro ledger Ù…ÛŒÚº 0 Ù…ØªØ¹Ù„Ù‚Û Ø±ÛŒÚ©Ø§Ø±Úˆ Ù…Ù„Û’Û”",
    showing: "Ø¯Ú©Ú¾Ø§Ø¦ÛŒ Ø¬Ø§ Ø±ÛÛŒ ÛÛŒÚº",
    of: "Ù…ÛŒÚº Ø³Û’",
    latest: "ØªØ§Ø²Û ØªØ±ÛŒÙ†",
    entries: "Ø§Ù†Ø¯Ø±Ø§Ø¬Ø§Øª",
    noIncome: "Ø§Ø³ Ù…Ø¯Øª Ù…ÛŒÚº Ú©ÙˆØ¦ÛŒ Ø¢Ù…Ø¯Ù†ÛŒ Ø¯Ø±Ø¬ Ù†ÛÛŒÚº ÛÙˆØ¦ÛŒÛ”",
    comparison: "ØªØµØ¯ÛŒÙ‚ Ø´Ø¯Û Ù…Ø¯Øª Ú©Ø§ Ù…ÙˆØ§Ø²Ù†Û",
  },
} as const;

export type LedgerMateCopyKey = keyof typeof LEDGERMATE_COPY.english;

export function ledgerMateCopy(language: LedgerMateLanguage, key: LedgerMateCopyKey): string {
  return LEDGERMATE_COPY[language][key];
}
