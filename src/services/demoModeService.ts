import { Organization, UserProfile } from "../types";
import { LedgerAccount } from "../types/ledger";
import { getKarachiBusinessDate } from "../lib/dates";
import { replaceCachedAccounts } from "./offlineAccountStore";
import { enqueueOfflineTransaction, getOfflineQueue, dequeueOfflineTransaction } from "./offlineQueue";
import { SEED_CATEGORIES } from "../parser/matcher";
import { sqliteRepository } from "./sqliteRepository";

export const DEMO_ORGANIZATION_ID = "demo-shop-org-0001";
export const DEMO_USER_ID = "demo-user-0001";

export const DEMO_ORGANIZATION: Organization = {
  id: DEMO_ORGANIZATION_ID,
  name: "Yaqoob Demo Electronics",
  owner_name: "Muhammad Yaqoob",
  email: "demo@yaqoobenterprises.com",
  phone: "+92 300 1234567",
  address: "Shop # 14, Hall Road, Lahore, Pakistan",
  currency: "PKR",
  currency_symbol: "Rs.",
  country: "Pakistan",
  timezone: "Asia/Karachi",
  business_category: "Electronics & Mobile Shop",
  tax_rate: 0,
  tax_enabled: false,
  invoice_prefix: "DEMO-",
  next_invoice_number: 1042,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_PROFILE: UserProfile = {
  id: DEMO_USER_ID,
  email: "demo@yaqoobenterprises.com",
  full_name: "Muhammad Yaqoob (Owner)",
  role: "OWNER",
  organization_id: DEMO_ORGANIZATION_ID,
  is_active: true,
  created_at: new Date().toISOString(),
};

export const DEMO_ORG = DEMO_ORGANIZATION;
export const DEMO_USER = DEMO_PROFILE;

export function isDemoSessionActive(): boolean {
  try {
    return localStorage.getItem("yaqoob_demo_mode") === "true";
  } catch {
    return false;
  }
}

export const DEMO_ACCOUNTS: LedgerAccount[] = [
  {
    id: "demo-acc-cash-1",
    organization_id: DEMO_ORGANIZATION_ID,
    name: "Cash Drawer",
    type: "CASH",
    balance_paisa: 4500000, // Rs 45,000
    current_balance: 45000,
    opening_balance: 30000,
    is_active: true,
    is_default: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-acc-bank-1",
    organization_id: DEMO_ORGANIZATION_ID,
    name: "Meezan Bank (Shop Acct)",
    type: "BANK",
    balance_paisa: 12500000, // Rs 125,000
    current_balance: 125000,
    opening_balance: 100000,
    is_active: true,
    is_default: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-acc-wallet-1",
    organization_id: DEMO_ORGANIZATION_ID,
    name: "JazzCash Merchant",
    type: "DIGITAL_WALLET",
    balance_paisa: 1850000, // Rs 18,500
    current_balance: 18500,
    opening_balance: 10000,
    is_active: true,
    is_default: false,
    created_at: new Date().toISOString(),
  },
];

export interface DemoWorkspaceSetupResult {
  organization: Organization;
  profile: UserProfile;
  user: UserProfile;
  accounts: LedgerAccount[];
  transactions: any[];
}

let demoWorkspaceSetup: Promise<DemoWorkspaceSetupResult> | null = null;

export function setupDemoWorkspace(): Promise<DemoWorkspaceSetupResult> {
  if (!demoWorkspaceSetup) {
    demoWorkspaceSetup = seedDemoWorkspace().finally(() => {
      demoWorkspaceSetup = null;
    });
  }
  return demoWorkspaceSetup;
}

async function seedDemoWorkspace(): Promise<DemoWorkspaceSetupResult> {
  const todayStr = getKarachiBusinessDate();
  const nowIso = new Date().toISOString();

  // 1. Seed accounts into local cache
  await replaceCachedAccounts(DEMO_ORGANIZATION_ID, DEMO_ACCOUNTS);

  // 2. Cache categories for demo shop
  try {
    localStorage.setItem(
      `shop-pro:parser-categories:${DEMO_ORGANIZATION_ID}`,
      JSON.stringify(SEED_CATEGORIES),
    );
  } catch {}

  // 3. Clear any leftover demo items from queue before seeding fresh sample entries
  const existingQueue = await getOfflineQueue();
  for (const item of existingQueue) {
    if (item.organizationId === DEMO_ORGANIZATION_ID) {
      await dequeueOfflineTransaction(item.idempotencyKey);
    }
  }

  // 4. Seed realistic sample transactions for today
  const demoTransactions = [
    {
      id: "demo-tx-1",
      idempotencyKey: `demo-tx-${Date.now()}-1`,
      organizationId: DEMO_ORGANIZATION_ID,
      createdBy: DEMO_USER_ID,
      accountId: "demo-acc-cash-1",
      type: "income",
      amountPaisa: 1850000, // Rs 18,500
      categoryId: "cat-sale",
      categoryName: "Sale",
      businessDate: todayStr,
      deviceEntryTime: new Date(Date.now() - 3600000 * 3).toISOString(), // 3 hours ago
      note: "LED Monitor 24-inch sale",
      rawText: "sale 18500 led monitor cash",
      createdByName: "Muhammad Yaqoob",
      status: "queued" as const,
      attempts: 0,
      createdAt: Date.now() - 3600000 * 3,
    },
    {
      id: "demo-tx-2",
      idempotencyKey: `demo-tx-${Date.now()}-2`,
      organizationId: DEMO_ORGANIZATION_ID,
      createdBy: DEMO_USER_ID,
      accountId: "demo-acc-cash-1",
      type: "expense",
      amountPaisa: 45000, // Rs 450
      categoryId: "cat-tea",
      categoryName: "Tea & Refreshments",
      businessDate: todayStr,
      deviceEntryTime: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
      note: "Morning chai and samosas for staff",
      rawText: "chai samosa 450",
      createdByName: "Muhammad Yaqoob",
      status: "queued" as const,
      attempts: 0,
      createdAt: Date.now() - 3600000 * 2,
    },
    {
      id: "demo-tx-3",
      idempotencyKey: `demo-tx-${Date.now()}-3`,
      organizationId: DEMO_ORGANIZATION_ID,
      createdBy: DEMO_USER_ID,
      accountId: "demo-acc-bank-1",
      type: "income",
      amountPaisa: 750000, // Rs 7,500
      categoryId: "cat-sale",
      categoryName: "Sale",
      businessDate: todayStr,
      deviceEntryTime: new Date(Date.now() - 3600000 * 1).toISOString(), // 1 hour ago
      note: "Cables & power bank batch",
      rawText: "sale 7500 bank meezan transfer",
      createdByName: "Muhammad Yaqoob",
      status: "queued" as const,
      attempts: 0,
      createdAt: Date.now() - 3600000 * 1,
    },
    {
      id: "demo-tx-4",
      idempotencyKey: `demo-tx-${Date.now()}-4`,
      organizationId: DEMO_ORGANIZATION_ID,
      createdBy: DEMO_USER_ID,
      accountId: "demo-acc-cash-1",
      type: "expense",
      amountPaisa: 320000, // Rs 3,200
      categoryId: "cat-util",
      categoryName: "Utilities",
      businessDate: todayStr,
      deviceEntryTime: new Date(Date.now() - 1800000).toISOString(), // 30 mins ago
      note: "Shop backup generator fuel",
      rawText: "generator petrol 3200",
      createdByName: "Muhammad Yaqoob",
      status: "queued" as const,
      attempts: 0,
      createdAt: Date.now() - 1800000,
    },
  ];

  for (const tx of demoTransactions) {
    await enqueueOfflineTransaction(tx);
  }

  // 5. Cache locally in SQLite if available
  try {
    await sqliteRepository.createLocalOwnerAccount(
      DEMO_ORGANIZATION,
      DEMO_PROFILE,
    );
  } catch {}

  try {
    localStorage.setItem("yaqoob_demo_mode", "true");
    localStorage.setItem("yaqoob_demo_accounts", JSON.stringify(DEMO_ACCOUNTS));
    localStorage.setItem("yaqoob_demo_transactions", JSON.stringify(demoTransactions));
  } catch {}

  return {
    organization: DEMO_ORGANIZATION,
    profile: DEMO_PROFILE,
    user: DEMO_PROFILE,
    accounts: DEMO_ACCOUNTS,
    transactions: demoTransactions,
  };
}

export async function cleanupDemoWorkspace(): Promise<void> {
  // 1. Remove demo queue transactions
  const queue = await getOfflineQueue();
  for (const item of queue) {
    if (item.organizationId === DEMO_ORGANIZATION_ID) {
      await dequeueOfflineTransaction(item.idempotencyKey);
    }
  }

  // 2. Remove demo accounts
  await replaceCachedAccounts(DEMO_ORGANIZATION_ID, []);

  // 3. Clear localStorage markers
  try {
    localStorage.removeItem(`shop-pro:parser-categories:${DEMO_ORGANIZATION_ID}`);
    localStorage.removeItem(`shop-pro:category-suggestions:${DEMO_ORGANIZATION_ID}:${DEMO_USER_ID}`);
    localStorage.removeItem("yaqoob_demo_mode");
    localStorage.removeItem("yaqoob_demo_accounts");
    localStorage.removeItem("yaqoob_demo_transactions");
  } catch {}
}
