// Shared currency list + helpers.
// Order: Syrian Pound & US Dollar first (existing defaults), then Turkish Lira
// and Euro, then the remaining Arab-country currencies.
export type Currency = { code: string; name: string; symbol: string };

export const CURRENCIES: Currency[] = [
  { code: 'SYP', name: 'ليرة سورية', symbol: 'ل.س' },
  { code: 'USD', name: 'دولار أمريكي', symbol: '$' },
  { code: 'TRY', name: 'ليرة تركية', symbol: '₺' },
  { code: 'EUR', name: 'يورو', symbol: '€' },
  { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
  { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
  { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م' },
  { code: 'QAR', name: 'ريال قطري', symbol: 'ر.ق' },
  { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك' },
  { code: 'BHD', name: 'دينار بحريني', symbol: 'د.ب' },
  { code: 'OMR', name: 'ريال عماني', symbol: 'ر.ع' },
  { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ' },
  { code: 'LBP', name: 'ليرة لبنانية', symbol: 'ل.ل' },
  { code: 'IQD', name: 'دينار عراقي', symbol: 'د.ع' },
  { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي' },
  { code: 'LYD', name: 'دينار ليبي', symbol: 'د.ل' },
  { code: 'TND', name: 'دينار تونسي', symbol: 'د.ت' },
  { code: 'DZD', name: 'دينار جزائري', symbol: 'د.ج' },
  { code: 'MAD', name: 'درهم مغربي', symbol: 'د.م' },
  { code: 'SDG', name: 'جنيه سوداني', symbol: 'ج.س' },
  { code: 'MRU', name: 'أوقية موريتانية', symbol: 'أ.م' },
  { code: 'SOS', name: 'شلن صومالي', symbol: 'ش.ص' },
  { code: 'DJF', name: 'فرنك جيبوتي', symbol: 'ف.ج' },
  { code: 'KMF', name: 'فرنك قمري', symbol: 'ف.ق' },
];

const SYMBOLS: Record<string, string> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol]));
const NAMES: Record<string, string> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.name]));

export const curSymbol = (code = 'SYP') => SYMBOLS[code] || code;
export const curName = (code = 'SYP') => NAMES[code] || code;
export const money = (n: number, code = 'SYP') => `${Math.round(Number(n) || 0).toLocaleString('en')} ${curSymbol(code)}`;
