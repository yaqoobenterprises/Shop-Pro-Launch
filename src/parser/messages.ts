import { getModuleRegion } from '../regional/region';

const messages = {
  noAmount: ['No valid amount found. Please enter an amount (e.g. PRINT 300).', 'درست رقم نہیں ملی۔ براہ کرم رقم درج کریں (مثلاً PRINT 300)۔'],
  ambiguousDate: ['"kal" is ambiguous (can mean yesterday or tomorrow). Did you mean yesterday or today?', '"kal" مبہم ہے (اس کا مطلب گزشتہ روز یا آنے والا کل ہو سکتا ہے)۔ کیا آپ کی مراد گزشتہ روز ہے یا آج؟'],
  yesterday: ['Yesterday', 'گزشتہ روز'],
  today: ['Today', 'آج'],
  bareNumber: ['Bare number entered. What is this {amount} for?', 'صرف رقم درج کی گئی ہے۔ یہ {amount} کس چیز کے لیے ہے؟'],
  income: ['Income', 'آمدنی'],
  expense: ['Expense', 'اخراجات'],
  capitalIn: ['Capital In', 'سرمایہ جمع'],
  withdrawal: ['Withdrawal', 'رقم کی نکاسی'],
  adjustment: ['Adjustment', 'ایڈجسٹمنٹ'],
  systemConfirmation: ['{name} entry requires confirmation before saving.', '{name} کے اندراج کو محفوظ کرنے سے پہلے تصدیق ضروری ہے۔'],
  unknownCategory: ['Unknown category "{category}". How should we record {amount}?', 'نامعلوم زمرہ "{category}"۔ {amount} کو کس طرح درج کریں؟'],
  incomeCategory: ['Income ({category})', 'آمدنی ({category})'],
  expenseCategory: ['Expense ({category})', 'اخراجات ({category})'],
  didYouMean: ['Did you mean "{name}" ({quality} match for "{category}")?', 'کیا آپ کی مراد "{name}" ہے؟ ("{category}" سے {quality} مماثلت)'],
  yesCategory: ['Yes, {name} ({kind})', 'ہاں، {name} ({kind})'],
  differentCategory: ['Different Category', 'مختلف زمرہ'],
  expenseSign: ['"{name}" is an expense category, but was typed without a minus sign. Is this an expense or a refund/income?', '"{name}" اخراجات کا زمرہ ہے لیکن اسے منفی نشان کے بغیر درج کیا گیا۔ کیا یہ خرچ ہے یا واپسی/آمدنی؟'],
  expenseAmount: ['Expense: {amount}', 'اخراجات: {amount}'],
  incomeAmount: ['Income: {amount}', 'آمدنی: {amount}'],
  incomeSign: ['"{name}" is an income category, but was typed with a minus sign (-). Is this an expense/refund or income?', '"{name}" آمدنی کا زمرہ ہے لیکن اسے منفی نشان (-) کے ساتھ درج کیا گیا۔ کیا یہ خرچ/واپسی ہے یا آمدنی؟'],
  refundAmount: ['Expense / Refund: {amount}', 'اخراجات / واپسی: {amount}'],
  unusualAmount: ['Amount {amount} exceeds the usual limit of {limit} for {name}.', '{name} کے لیے رقم {amount} معمول کی حد {limit} سے زیادہ ہے۔'],
  possibleDuplicate: ['Possible duplicate entry: Another {amount} {name} was entered in the last 3 minutes.', 'ممکنہ نقل اندراج: گزشتہ 3 منٹ میں {name} کی یہی رقم {amount} دوبارہ درج ہوئی۔'],
} as const;

type ParserMessageKey = keyof typeof messages;

export function parserMessage(
  key: ParserMessageKey,
  values: Record<string, string | number> = {},
): string {
  const template = messages[key][getModuleRegion().uiLanguage === 'ur' ? 1 : 0];
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    values[name] === undefined ? `{${name}}` : String(values[name]),
  );
}
