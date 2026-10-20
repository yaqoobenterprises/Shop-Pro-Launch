import type { LedgerAccount } from "../types/ledger";

type ProviderKind = Extract<LedgerAccount["type"], "BANK" | "DIGITAL_WALLET">;

export interface AccountProvider {
  key: string;
  name: string;
  kind: ProviderKind;
  aliases: string[];
  mark: string;
  color: string;
  logo?: string;
}

/**
 * Common Pakistani banks and payment wallets. Names remain editable so this
 * directory can suggest a provider without restricting custom account names.
 */
export const PAKISTAN_ACCOUNT_PROVIDERS: AccountProvider[] = ([
  { key: "albaraka", name: "Al Baraka Bank", kind: "BANK", aliases: ["AlBaraka", "Al Baraka Bank Pakistan"], mark: "AB", color: "#8a1538" },
  { key: "allied", name: "Allied Bank", kind: "BANK", aliases: ["Allied Bank Limited", "ABL"], mark: "ABL", color: "#00529b" },
  { key: "alfalah", name: "Bank Alfalah", kind: "BANK", aliases: ["Alfalah Bank", "Bank Al Falah", "BAFL"], mark: "A", color: "#d71920" },
  { key: "alfa", name: "Alfa by Bank Alfalah", kind: "DIGITAL_WALLET", aliases: ["Alfa", "Alfa Wallet", "Bank Alfalah Alfa"], mark: "A", color: "#c42026" },
  { key: "alhabib", name: "Bank AL Habib", kind: "BANK", aliases: ["Bank Al Habib Limited", "Bank Al-Habib", "BAHL"], mark: "BAH", color: "#00843d" },
  { key: "abhi-mfb", name: "ABHI Microfinance Bank", kind: "BANK", aliases: ["ABHI MFB", "ABHI Microfinance"], mark: "ABHI", color: "#0077a8" },
  { key: "apna", name: "Apna Microfinance Bank", kind: "BANK", aliases: ["Apna Bank", "Apna Microfinance"], mark: "AP", color: "#f47721" },
  { key: "asa-mfb", name: "ASA Microfinance Bank", kind: "BANK", aliases: ["ASA Pakistan Microfinance Bank", "ASA MFB"], mark: "ASA", color: "#da1f3d" },
  { key: "askari", name: "Askari Bank", kind: "BANK", aliases: ["Askari Bank Limited", "Askari", "AB"], mark: "ASK", color: "#007a3d" },
  { key: "bank-china", name: "Bank of China", kind: "BANK", aliases: ["Bank of China Pakistan", "BOC"], mark: "BOC", color: "#c8102e" },
  { key: "bank-khyber", name: "Bank of Khyber", kind: "BANK", aliases: ["The Bank of Khyber", "BOK"], mark: "BOK", color: "#00843d" },
  { key: "bank-punjab", name: "The Bank of Punjab", kind: "BANK", aliases: ["Bank of Punjab", "BOP"], mark: "BOP", color: "#0072bc" },
  { key: "bankislami", name: "BankIslami", kind: "BANK", aliases: ["Bank Islami", "BankIslami Pakistan", "Bank Islami Pakistan Limited"], mark: "BI", color: "#006341" },
  { key: "citibank", name: "Citibank", kind: "BANK", aliases: ["Citibank Pakistan", "Citi Bank", "Citi"], mark: "CITI", color: "#056dae" },
  { key: "deutsche", name: "Deutsche Bank", kind: "BANK", aliases: ["Deutsche Bank Pakistan", "DB"], mark: "DB", color: "#0018a8" },
  { key: "dib", name: "Dubai Islamic Bank", kind: "BANK", aliases: ["Dubai Islamic Bank Pakistan", "DIB Pakistan", "DIB"], mark: "DIB", color: "#007a53" },
  { key: "digitt", name: "Digitt+", kind: "DIGITAL_WALLET", aliases: ["Digitt Plus", "Akhtar Fuiou", "Akhtar Fuiou Technologies"], mark: "D+", color: "#342b75" },
  { key: "faysal", name: "Faysal Bank", kind: "BANK", aliases: ["Faysal Bank Limited", "FBL"], mark: "FAYSAL", color: "#7a1f3d" },
  { key: "first-women", name: "First Women Bank", kind: "BANK", aliases: ["First Women Bank Limited", "FWBL"], mark: "FWB", color: "#9b2779" },
  { key: "hbl-microfinance", name: "HBL Microfinance Bank", kind: "BANK", aliases: ["HBL Microfinance", "HBL MfB", "HBL MFB"], mark: "HBL MF", color: "#009739" },
  { key: "hbl-konnect", name: "HBL Konnect", kind: "DIGITAL_WALLET", aliases: ["Konnect by HBL", "HBL Konnect Wallet"], mark: "K", color: "#00a651" },
  { key: "halan-mfb", name: "Halan Microfinance Bank", kind: "BANK", aliases: ["Halan Bank", "Advans Pakistan Microfinance Bank", "Advans Microfinance Bank"], mark: "H", color: "#1764a5" },
  { key: "hbl", name: "Habib Bank Limited (HBL)", kind: "BANK", aliases: ["Habib Bank", "HBL", "HBL Pakistan", "HBL Limited"], mark: "HBL", color: "#009739" },
  { key: "habib-metro", name: "Habib Metropolitan Bank", kind: "BANK", aliases: ["HabibMetro", "Habib Metro Bank", "HMB"], mark: "HMB", color: "#8b1e41" },
  { key: "icbc", name: "ICBC Pakistan", kind: "BANK", aliases: ["Industrial and Commercial Bank of China", "ICBC"], mark: "ICBC", color: "#c8102e" },
  { key: "js", name: "JS Bank", kind: "BANK", aliases: ["JS Bank Limited", "JS"], mark: "JS", color: "#ed1c24" },
  { key: "jazzcash", name: "JazzCash", kind: "DIGITAL_WALLET", aliases: ["Jazz Cash", "JazzCash Wallet", "Mobilink Microfinance Bank"], mark: "JC", color: "#ed1c24", logo: "/assets/jazzcash-2025.png" },
  { key: "keenu", name: "Keenu Wallet", kind: "DIGITAL_WALLET", aliases: ["Keenu"], mark: "K", color: "#f58220" },
  { key: "khushhali", name: "Khushhali Microfinance Bank", kind: "BANK", aliases: ["Khushhali Bank", "Khushhali Microfinance", "KMBL"], mark: "KMB", color: "#00a651" },
  { key: "mashreq", name: "Mashreq Bank Pakistan", kind: "BANK", aliases: ["Mashreq Pakistan", "Mashreq"], mark: "M", color: "#e13a3e" },
  { key: "lolc", name: "LOLC Microfinance Bank", kind: "BANK", aliases: ["LOLC Pakistan", "LOLC Microfinance"], mark: "LOLC", color: "#00529b" },
  { key: "makramah", name: "Bank Makramah", kind: "BANK", aliases: ["Summit Bank", "Bank Makramah Limited", "BML"], mark: "BM", color: "#1c4280" },
  { key: "mcb-islamic", name: "MCB Islamic Bank", kind: "BANK", aliases: ["MCB Islamic", "MCB Islamic Bank Limited"], mark: "MCB I", color: "#ba2025" },
  { key: "mcb", name: "MCB Bank", kind: "BANK", aliases: ["Muslim Commercial Bank", "MCB", "MCB Bank Limited"], mark: "MCB", color: "#003f87" },
  { key: "meezan", name: "Meezan Bank", kind: "BANK", aliases: ["Meezan", "Meezan Bank Limited"], mark: "M", color: "#006b54", logo: "/assets/meezan-bank-2026.png" },
  { key: "nayapay", name: "NayaPay", kind: "DIGITAL_WALLET", aliases: ["Naya Pay", "NayaPay Wallet"], mark: "N", color: "#5728d8" },
  { key: "nbp", name: "National Bank of Pakistan (NBP)", kind: "BANK", aliases: ["National Bank of Pakistan", "NBP"], mark: "NBP", color: "#00843d" },
  { key: "onezapp", name: "OneZapp", kind: "DIGITAL_WALLET", aliases: ["One Zapp", "E-Processing Systems", "EP Systems"], mark: "1Z", color: "#4e2b83" },
  { key: "nrsp", name: "NRSP Microfinance Bank", kind: "BANK", aliases: ["NRSP Bank", "NRSP Microfinance"], mark: "NRSP", color: "#009b77" },
  { key: "opay", name: "OPay", kind: "DIGITAL_WALLET", aliases: ["OPay Wallet", "Finja OPay", "Finja"], mark: "O", color: "#0b8f51" },
  { key: "sadapay", name: "SadaPay", kind: "DIGITAL_WALLET", aliases: ["Sada Pay", "SadaPay Wallet"], mark: "S", color: "#422c85" },
  { key: "silk", name: "Silkbank", kind: "BANK", aliases: ["Silk Bank", "Silkbank Limited"], mark: "S", color: "#7e2d88" },
  { key: "sindh", name: "Sindh Bank", kind: "BANK", aliases: ["Sindh Bank Limited"], mark: "SB", color: "#007a3d" },
  { key: "sindh-mfb", name: "Sindh Microfinance Bank", kind: "BANK", aliases: ["Sindh Microfinance", "Sindh MFB"], mark: "SMB", color: "#00a1a5" },
  { key: "sme", name: "SME Bank", kind: "BANK", aliases: ["SME Bank Limited"], mark: "SME", color: "#008c95" },
  { key: "soneri", name: "Soneri Bank", kind: "BANK", aliases: ["Soneri Bank Limited"], mark: "SONERI", color: "#ed1c24" },
  { key: "standard-chartered", name: "Standard Chartered", kind: "BANK", aliases: ["Standard Chartered Pakistan", "SCB", "SCB Pakistan"], mark: "SC", color: "#008f83" },
  { key: "ppcbl", name: "Punjab Provincial Cooperative Bank", kind: "BANK", aliases: ["PPCBL", "Punjab Provincial Cooperative Bank Limited"], mark: "PPC", color: "#007a3d" },
  { key: "raqami", name: "Raqami Islamic Digital Bank", kind: "BANK", aliases: ["Raqami Digital", "Raqami Bank"], mark: "R", color: "#0e6b43" },
  { key: "hubpay", name: "Hubpay", kind: "DIGITAL_WALLET", aliases: ["HubPay Wallet", "HubPay Pakistan"], mark: "H", color: "#4a2782" },
  { key: "yap", name: "YAP Pakistan", kind: "DIGITAL_WALLET", aliases: ["YAP Wallet", "YAP"], mark: "Y", color: "#2e3192" },
  { key: "samba", name: "SAMBA Bank", kind: "BANK", aliases: ["Samba Bank Limited", "SAMBA"], mark: "S", color: "#ed1c24" },
  { key: "ubl", name: "United Bank Limited (UBL)", kind: "BANK", aliases: ["United Bank", "UBL", "UBL Pakistan", "UBL Limited"], mark: "UBL", color: "#00a859" },
  { key: "upaisa", name: "UPaisa", kind: "DIGITAL_WALLET", aliases: ["U Paisa", "U-Paisa", "UPaisa Wallet"], mark: "U", color: "#ed1c24" },
  { key: "ubank", name: "U Microfinance Bank", kind: "BANK", aliases: ["U Bank", "U Microfinance", "U Microfinance Bank Limited"], mark: "U", color: "#ed1c24" },
  { key: "ztbl", name: "Zarai Taraqiati Bank (ZTBL)", kind: "BANK", aliases: ["Zarai Taraqiati Bank Limited", "ZTBL", "Agricultural Development Bank"], mark: "ZTBL", color: "#00843d" },
  { key: "zindigi", name: "Zindigi", kind: "DIGITAL_WALLET", aliases: ["Zindigi Wallet", "JS Zindigi"], mark: "Z", color: "#5a2ca0" },
  { key: "telenor-mfb", name: "Telenor Microfinance Bank", kind: "BANK", aliases: ["Telenor Bank", "Telenor Microfinance"], mark: "TMB", color: "#00a9ce" },
  { key: "easypaisa", name: "Easypaisa", kind: "DIGITAL_WALLET", aliases: ["Easy Paisa", "EasyPaisa", "Easypaisa Wallet"], mark: "e", color: "#70b62c" },
] satisfies AccountProvider[]).sort((left, right) => left.name.localeCompare(right.name));

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

const providerMatchers = PAKISTAN_ACCOUNT_PROVIDERS
  .flatMap((provider) => [provider.name, ...provider.aliases].map((alias) => ({
    provider,
    alias: normalize(alias),
  })))
  .sort((left, right) => right.alias.length - left.alias.length);

export const findAccountProvider = (accountName: string): AccountProvider | undefined => {
  const normalizedName = normalize(accountName);
  if (!normalizedName) return undefined;

  return providerMatchers.find(({ alias }) => {
    if (alias.length <= 3) {
      return new RegExp(`(^|[^a-z0-9])${alias.split("").join("[^a-z0-9]*")}(?=$|[^a-z0-9])`, "i").test(accountName);
    }
    return normalizedName.includes(alias);
  })?.provider;
};
