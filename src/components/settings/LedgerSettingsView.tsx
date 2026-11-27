import React, { useState, useEffect, useRef } from "react";
import { Select } from "../common/Select";
import {
  getSupabaseClient,
  hasConfiguredCloudSession,
  SupabaseSessionRequiredError,
} from "../../lib/supabase";
import { Category } from "../../types/ledger";
import { exportToCSV } from "../../lib/utils";
import { getKarachiBusinessDate } from "../../lib/dates";
import { getSecurityPrincipal } from "../../lib/security";
import { ledgerService, isPermissionOrAuthError } from "../../services/ledgerService";
import { canRestoreDatabase, canManageBusinessConfig, canViewReports } from "../../lib/permissions";
import {
  enqueueOfflineTransaction,
  getOfflineQueue,
} from "../../services/offlineQueue";
import {
  getOfflineDrafts,
  saveOfflineDraft,
} from "../../services/offlineDraftStore";
import { isTauriEnvironment } from "../../services/sqliteEngine";
import { sqliteRepository } from "../../services/sqliteRepository";
import {
  createLocalRecoveryBundle,
  restoreLocalRecoveryBundle,
} from "../../services/localRecoveryBundle";
import {
  Layers,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  Plus,
  Edit2,
  Check,
  X,
  Trash2,
  UserRound,
  ShieldCheck,
  Languages,
  Globe,
  Database,
} from "lucide-react";
import { PaperRegisterImportModal } from "./PaperRegisterImportModal";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { setThemePreference, type ThemePreference } from "../../lib/theme";
import { useThemePreference } from "../../lib/useThemePreference";
import { DEMO_ORGANIZATION_ID } from "../../services/demoModeService";
import { SEED_CATEGORIES } from "../../parser/matcher";
import { RegionSettingsSection } from "./RegionSettingsSection";
import { UserPreferencesSection } from "./UserPreferencesSection";
import { ProfileSettingsSection } from "./ProfileSettingsSection";
import { SecuritySettingsSection } from "./SecuritySettingsSection";
import { useI18n } from "../../i18n";
import "./SettingsWorkspace.css";
import { isFeatureEnabled } from "../../config/features";

async function requireSettingsCloudSession(userId: string): Promise<void> {
  if (!(await hasConfiguredCloudSession(userId))) {
    throw new SupabaseSessionRequiredError();
  }
}

export const LedgerSettingsView: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { showToast } = useApp();
  const isDemo = getSecurityPrincipal()?.organizationId === DEMO_ORGANIZATION_ID;
  const preferencesEnabled = isFeatureEnabled("languageUr") || isFeatureEnabled("entryModes");
  const [activeSettingsSection, setActiveSettingsSection] = useState("profile");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoriesLoadError, setCategoriesLoadError] = useState(false);
  const [categoriesLoadMessage, setCategoriesLoadMessage] = useState("");
  const canManage = canManageBusinessConfig(user?.role);
  const canExport = canViewReports(user?.role) && !isDemo;
  const categoryLock = useRef(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const dataLock = useRef(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [categoriesReadOnly, setCategoriesReadOnly] = useState(false);
  const [showPaperImport, setShowPaperImport] = useState(false);
  const [isExportingLocalData, setIsExportingLocalData] = useState(false);
  const [isRestoringLocalData, setIsRestoringLocalData] = useState(false);
  const localRecoveryInputRef = useRef<HTMLInputElement>(null);
  const appearance = useThemePreference();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] =
    useState<Category["kind"]>("income");

  const settingsNavigationGroups = [
    {
      label: "Account",
      items: [
        { id: "profile", label: "Profile", Icon: UserRound },
        { id: "security", label: "Security", Icon: ShieldCheck },
      ],
    },
    {
      label: "Preferences",
      items: [
        ...(preferencesEnabled
          ? [{ id: "user-preferences", label: t("settings.language"), Icon: Languages }]
          : []),
        { id: "appearance", label: t("settings.appearance"), Icon: Sun },
      ],
    },
    {
      label: "Shop setup",
      items: [
        { id: "region", label: "Currency", Icon: Globe },
        { id: "categories", label: t("settings.categories"), Icon: Layers },
      ],
    },
    {
      label: "Data",
      items: [
        { id: "data-tools", label: t("settings.dataTools"), Icon: Database },
      ],
    },
  ];

  // Category Edit State
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    setCategoriesLoadError(false);
    setCategoriesLoadMessage("");
    setCategoriesReadOnly(false);
    const principal = getSecurityPrincipal();
    if (!principal) {
      setCategoriesReadOnly(true);
      setCategoriesLoadError(true);
      setCategoriesLoadMessage("Sign in to this shop to view or edit categories.");
      setIsLoading(false);
      return;
    }
    if (principal.organizationId === DEMO_ORGANIZATION_ID) {
      setCategories(SEED_CATEGORIES.map((category, index) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        unusual_amount_limit_paisa: category.unusualLimitPaisa,
        is_default: true,
        is_active: true,
        display_order: index + 1,
        created_at: new Date(0).toISOString(),
      })));
      setIsLoading(false);
      return;
    }

    const cacheKey = `shop-pro:categories:${principal.organizationId}`;
    try {
      await requireSettingsCloudSession(principal.id);
      const supabase = getSupabaseClient();
      const { data: cats, error: categoriesError } = await supabase
        .from("categories")
        .select("*")
        .eq("organization_id", principal.organizationId)
        .order("display_order", { ascending: true });
      if (categoriesError) throw categoriesError;
      setCategories(cats || []);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cats || []));
      } catch {
        // Settings still work when browser storage is unavailable.
      }
    } catch (err) {
      console.error("Error fetching settings data:", err);
      setCategoriesReadOnly(true);
      setCategoriesLoadError(true);
      setCategoriesLoadMessage(
        err instanceof SupabaseSessionRequiredError
          ? "Your cloud session is missing or has expired. Sign in again to view or edit categories."
          : isPermissionOrAuthError(err)
            ? "This account cannot access this shop's categories. Check its shop membership or sign in with the correct account."
            : "Categories could not be refreshed. The rest of Settings is available; reconnect and retry to view or edit them.",
      );
      try {
        const cached = JSON.parse(
          localStorage.getItem(cacheKey) || "[]",
        ) as Category[];
        setCategories(Array.isArray(cached) ? cached.filter((category) =>
          category && typeof category.id === "string" && typeof category.name === "string" &&
          (category.kind === "income" || category.kind === "expense"),
        ) : []);
      } catch {
        setCategories([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveCategory = async (id: string) => {
    if (categoriesReadOnly || !canManage || categoryLock.current || isLoading) return;
    if (getSecurityPrincipal()?.organizationId === DEMO_ORGANIZATION_ID) {
      showToast("info", "Demo settings are read-only");
      return;
    }
    const supabase = getSupabaseClient();
    const principal = getSecurityPrincipal();
    if (!principal) return;

    try {
      if (!editName.trim()) {
        showToast("error", "Check category details", "Enter a category name.");
        return;
      }
      categoryLock.current = true; setCategoryBusy(true);
      await requireSettingsCloudSession(principal.id);
      const { data, error } = await supabase
        .from("categories")
        .update({
          name: editName.trim(),
        })
        .eq("id", id)
        .eq("organization_id", principal.organizationId).select("id").maybeSingle();
      if (error || !data) throw error || new Error("Category update was not verified.");

      setEditingCatId(null);
      await loadData();
      showToast("success", "Category updated");
    } catch (err) {
      console.error("Error updating category:", err);
      showToast("error", "Category not updated", "Check the name and try again.");
    } finally { categoryLock.current = false; setCategoryBusy(false); }
  };

  const handleAddCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (categoriesReadOnly || !canManage || categoryLock.current || isLoading) return;
    if (getSecurityPrincipal()?.organizationId === DEMO_ORGANIZATION_ID) {
      showToast("info", "Demo settings are read-only");
      return;
    }
    const name = newCategoryName.trim();
    const principal = getSecurityPrincipal();
    if (!name || !principal) {
      showToast("error", "Check category details", "Enter a category name.");
      return;
    }

    const supabase = getSupabaseClient();
    try {
      categoryLock.current = true; setCategoryBusy(true);
      await requireSettingsCloudSession(principal.id);
      const { data, error } = await supabase.from("categories").insert({
        id: crypto.randomUUID(),
        organization_id: principal.organizationId,
        name,
        kind: newCategoryKind,
        is_default: false,
        is_active: true,
        display_order: categories.length + 1,
      }).select("id").maybeSingle();
      if (error || !data) throw error || new Error("Category creation was not verified.");
      setNewCategoryName("");
      setIsAddingCategory(false);
      await loadData();
      showToast("success", "Category added");
    } catch (err) {
      console.error("Error adding category:", err);
      showToast("error", "Category not added", "A category with this name may already exist.");
    } finally { categoryLock.current = false; setCategoryBusy(false); }
  };

  const handleRemoveCategory = async (category: Category) => {
    if (categoriesReadOnly || !canManage || categoryLock.current || isLoading || isDemo) return;
    if (!window.confirm(`Archive “${category.name}”? Existing transactions keep their category; it will no longer be offered for new entries.`)) return;
    const principal = getSecurityPrincipal();
    if (!principal) return;
    categoryLock.current = true; setCategoryBusy(true);
    try {
      await requireSettingsCloudSession(principal.id);
      const {data,error} = await getSupabaseClient().from("categories").update({is_active:false})
        .eq("id",category.id).eq("organization_id",principal.organizationId).select("id").maybeSingle();
      if (error || !data) throw error || new Error("Archive was not verified.");
      await loadData();
      showToast("success","Category archived","Existing records retain their category.");
    } catch { showToast("error","Category not archived","Reconnect and retry."); }
    finally { categoryLock.current = false; setCategoryBusy(false); }
  };

  const handleRestoreCategory = async (category: Category) => {
    if (categoriesReadOnly || !canManage || categoryLock.current || isLoading) return;
    if (getSecurityPrincipal()?.organizationId === DEMO_ORGANIZATION_ID) {
      showToast("info", "Demo settings are read-only");
      return;
    }
    const supabase = getSupabaseClient();
    const principal = getSecurityPrincipal();
    if (!principal) return;

    try {
      categoryLock.current = true; setCategoryBusy(true);
      await requireSettingsCloudSession(principal.id);
      const { data, error } = await supabase
        .from("categories")
        .update({ is_active: true })
        .eq("id", category.id)
        .eq("organization_id", principal.organizationId).select("id").maybeSingle();
      if (error || !data) throw error || new Error("Category restoration was not verified.");
      await loadData();
      showToast("success", "Category restored");
    } catch (err) {
      console.error("Error restoring category:", err);
      showToast("error", "Category not restored", "Please try again.");
    } finally { categoryLock.current = false; setCategoryBusy(false); }
  };

  const handleToggleAppearance = (theme: ThemePreference) => {
    if (!setThemePreference(theme)) {
      showToast("warning", "Theme changed for this session", "Browser storage is unavailable, so this choice may not survive a reload.");
    }
  };

  const exportEverything = async (format: "csv" | "json") => {
    if (!canExport || dataLock.current) return;
    if (getSecurityPrincipal()?.organizationId === DEMO_ORGANIZATION_ID) {
      showToast("info", "Demo exports are unavailable");
      return;
    }
    dataLock.current = true; setExportBusy(true);
    try {
      const principal = getSecurityPrincipal();
      if (!principal) throw new Error("Sign in to this shop before exporting transactions.");
      await requireSettingsCloudSession(principal.id);
      const txs = await ledgerService.getAllFilteredTransactions({status:"all"},{requireCloudSource:true});
      const dateStr = getKarachiBusinessDate();

      if (format === "json") {
        const jsonStr = JSON.stringify(txs, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
          "download",
          `shop_plus_cloud_transactions_${dateStr}.json`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const headers = [
          "ID",
          "Business Date",
          "Device Time",
          "Type",
          "Category",
          "Amount (Paisa)",
          "Raw Text",
          "Status",
          "Void Reason",
          "Created By Name",
        ];

        const rows = txs.map(t => [
          t.id,
          t.business_date,
          t.device_entry_time,
          t.type,
          t.category_name || "",
          t.amount_paisa,
          t.raw_text || "",
          t.status,
          t.void_reason || "",
          t.created_by_name || "",
        ]);

        exportToCSV("shop_plus_cloud_transactions", headers, rows, dateStr);
      }
    } catch (err) {
      console.error("Error exporting everything:", err);
      showToast(
        "error",
        "Transaction export failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally { dataLock.current = false; setExportBusy(false); }
  };

  const exportLocalRecoveryBundle = async () => {
    if (isDemo || !canRestoreDatabase(user?.role) || dataLock.current) return;
    const principal = getSecurityPrincipal();
    if (!principal) {
      showToast("error", "Local backup unavailable", "Sign in to this shop before exporting device data.");
      return;
    }

    dataLock.current = true;
    setIsExportingLocalData(true);
    try {
      const [queue, drafts] = await Promise.all([
        getOfflineQueue(),
        getOfflineDrafts(principal.organizationId),
      ]);
      let sqliteBackup: unknown = null;
      if (isTauriEnvironment() && canRestoreDatabase(user?.role)) {
        const sqliteJson = await sqliteRepository.exportDatabaseBackup(principal.organizationId);
        const validation = sqliteRepository.validateDatabaseBackup(
          sqliteJson,
          principal.organizationId,
        );
        if (!validation.valid || !validation.archive) {
          throw new Error(validation.error || "The device database backup did not validate.");
        }
        sqliteBackup = validation.archive;
      }

      const bundle = await createLocalRecoveryBundle(
        principal.organizationId,
        queue,
        drafts,
        sqliteBackup,
        isTauriEnvironment() && !sqliteBackup,
      );
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `shop_plus_local_recovery_${getKarachiBusinessDate()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast(
        "success",
        "Device recovery file downloaded",
        `${bundle.indexedDb.queuedTransactions.length} queued transaction(s) and ${bundle.indexedDb.offlineDrafts.length} offline draft(s) included. Store the file securely; it contains business data.`,
      );
    } catch (err) {
      console.error("Error exporting local recovery data:", err);
      showToast(
        "error",
        "Device backup failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      dataLock.current = false; setIsExportingLocalData(false);
    }
  };

  const importLocalRecoveryBundle = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isDemo || !canRestoreDatabase(user?.role) || dataLock.current) return;
    if (file.size > 50 * 1024 * 1024) { showToast("error","Recovery file too large","Use a recovery file under 50 MB."); return; }

    const principal = getSecurityPrincipal();
    if (!principal) {
      showToast("error", "Local recovery unavailable", "Sign in to this shop before restoring device data.");
      return;
    }
    if (
      !window.confirm(
        "Restore this verified device recovery file? Pending work will be added without replacing existing entries. If it contains a SQLite snapshot, the current shop's local SQLite data will be replaced transactionally.",
      )
    ) {
      return;
    }

    dataLock.current = true; setIsRestoringLocalData(true);
    try {
      const bundle = JSON.parse(await file.text());
      const restored = await restoreLocalRecoveryBundle(
        bundle,
        principal.organizationId,
        {
          getQueue: getOfflineQueue,
          getDrafts: getOfflineDrafts,
          saveQueueItem: enqueueOfflineTransaction,
          saveDraft: saveOfflineDraft,
          ...(isTauriEnvironment() && canRestoreDatabase(user?.role)
            ? {
                restoreSqliteBackup: async (backup: unknown) => {
                  const validation = sqliteRepository.validateDatabaseBackup(
                    JSON.stringify(backup),
                    principal.organizationId,
                  );
                  if (!validation.valid) {
                    throw new Error(
                      validation.error || "The SQLite backup did not validate.",
                    );
                  }
                  await sqliteRepository.restoreDatabaseBackup(
                    JSON.stringify(backup),
                    principal.organizationId,
                  );
                },
              }
            : {}),
        },
      );
      showToast(
        "success",
        "Device recovery restored",
        `${restored.queuedTransactions} pending transaction(s) and ${restored.offlineDrafts} draft(s) added. Existing identical entries were left unchanged.`,
      );
    } catch (error) {
      console.error("Error restoring local recovery data:", error);
      showToast(
        "error",
        "Device recovery failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      dataLock.current = false; setIsRestoringLocalData(false);
    }
  };

  return (
    <div className="workspace-page page-content settings-page flex-1 space-y-5 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="workspace-header page-title flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="settings-page-heading">
          <h1 className="text-xl font-bold tracking-tight text-on-surface">
            Settings
          </h1>
        </div>
      </div>

      {showPaperImport && (
        <PaperRegisterImportModal
          onClose={() => setShowPaperImport(false)}
          onImportComplete={() => {
            setShowPaperImport(false);
            loadData();
          }}
        />
      )}

      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          {settingsNavigationGroups.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <h2 className="settings-nav-label">{group.label}</h2>
              {group.items.map(({ id, label, Icon }) => {
                const isActive = activeSettingsSection === id;
                return (
                  <button
                    key={id}
                    id={`settings-nav-${id}`}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    aria-controls={`settings-panel-${id}`}
                    onClick={() => setActiveSettingsSection(id)}
                    className={`settings-nav-item${isActive ? " is-active" : ""}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="settings-content">
          <div id="settings-panel-profile" role="region" aria-labelledby="settings-nav-profile" hidden={activeSettingsSection !== "profile"}>
            <ProfileSettingsSection />
          </div>
          <div id="settings-panel-security" role="region" aria-labelledby="settings-nav-security" hidden={activeSettingsSection !== "security"}>
            <SecuritySettingsSection />
          </div>
          <div id="settings-panel-region" role="region" aria-labelledby="settings-nav-region" hidden={activeSettingsSection !== "region"}>
            <RegionSettingsSection />
          </div>
          {preferencesEnabled && (
            <div id="settings-panel-user-preferences" role="region" aria-labelledby="settings-nav-user-preferences" hidden={activeSettingsSection !== "user-preferences"}>
              <UserPreferencesSection />
            </div>
          )}

      <div id="settings-panel-appearance" role="region" aria-labelledby="settings-nav-appearance" hidden={activeSettingsSection !== "appearance"}>
      <section id="appearance" className="workspace-panel settings-section p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="settings-icon"><Sun className="h-4 w-4" /></div>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">{t("settings.appearance")}</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:max-w-lg">
          {([
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ] as const).map(([theme, label, Icon]) => (
            <button
              key={theme}
              type="button"
              aria-pressed={appearance === theme}
              onClick={() => handleToggleAppearance(theme)}
              className={`flex min-h-12 items-center gap-2.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                appearance === theme
                  ? "border-primary/30 bg-primary/[0.07] text-primary"
                  : "border-border-standard bg-surface-bright text-secondary hover:bg-surface-container-low"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {appearance === theme && <Check className="ml-auto h-4 w-4" />}
            </button>
          ))}
        </div>
      </section>
      </div>

      <div id="settings-panel-categories" role="region" aria-labelledby="settings-nav-categories" hidden={activeSettingsSection !== "categories"}>
      <section id="categories" className="workspace-panel settings-section space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="settings-icon"><Layers className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-semibold text-on-surface">{t("settings.categories")}</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                {isDemo ? "Demo categories are read-only." : "Archive categories without deleting their history. Renaming a category changes its displayed label in reports."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingCategory((open) => !open)}
            disabled={isDemo || !canManage || categoriesReadOnly || categoryBusy || isLoading}
            className="inline-flex min-h-9 self-start items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-hover sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        </div>

        {isAddingCategory && (
          <form onSubmit={handleAddCategory} className="settings-create-category grid gap-2 rounded-xl border border-border-standard p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]">
            <input
              required
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Category name"
              aria-label="New category name"
            />
            <Select
              value={newCategoryKind}
              onChange={(event) => setNewCategoryKind(event.target.value as Category["kind"])}
              aria-label="Category type"
            >
              <option value="income">{t("settings.income")}</option>
              <option value="expense">{t("settings.expense")}</option>
            </Select>
            <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover">
              <Check className="h-3.5 w-3.5" /> Save
            </button>
            <button type="button" onClick={() => setIsAddingCategory(false)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </form>
        )}

        {categoriesLoadError && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-bg px-3.5 py-3 text-xs text-warning sm:flex-row sm:items-center sm:justify-between">
            <span>
              {categoriesLoadMessage}
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="min-h-8 shrink-0 rounded-lg border border-warning-border bg-surface-bright px-3 font-semibold text-on-surface transition hover:bg-surface-container-low"
            >
              Retry
            </button>
          </div>
        )}

        <div className="settings-category-list divide-y divide-border-standard overflow-hidden rounded-xl border border-border-standard">
          {isLoading ?
            <p className="p-6 text-center text-sm text-text-muted">{t("settings.loadingCategories")}</p>
          : categories.map((cat) => {
            const isEditing = editingCatId === cat.id;

            return (
              <div
                key={cat.id}
                className="flex flex-col justify-between gap-3 p-3.5 text-xs sm:flex-row sm:items-center"
              >
                {isEditing ?
                  <div className="flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Category name"
                      className="workspace-control px-2.5 py-1.5 text-xs"
                    />
                  </div>
                : <div>
                    <div className="flex items-center gap-2 font-semibold text-on-surface">
                      <span>{cat.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          cat.kind === "income" ?
                            "bg-success-bg text-success"
                          : "bg-danger-bg text-danger"
                        }`}
                      >
                        {cat.kind}
                      </span>
                      {!cat.is_active && (
                        <span className="rounded bg-surface-container-low px-1.5 py-0.5 text-[10px] text-text-muted">
                          Archived
                        </span>
                      )}
                      {cat.is_default && (
                        <span className="rounded bg-surface-container-low px-1.5 py-0.5 text-[10px] text-text-muted">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                }

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isEditing ?
                    <>
                      <button
                        onClick={() => handleSaveCategory(cat.id)}
                        disabled={isDemo || !canManage || categoriesReadOnly || categoryBusy || isLoading}
                        className="flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white hover:bg-primary-hover"
                        title="Save"
                      >
                        <Check className="h-3.5 w-3.5" /> Save
                      </button>
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-2.5 text-xs font-semibold text-secondary hover:bg-surface-container-low"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                    </>
                  : <>
                      <button
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditName(cat.name);
                        }}
                        disabled={isDemo || !canManage || categoriesReadOnly || categoryBusy || isLoading}
                        className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-2.5 text-xs font-semibold text-secondary hover:bg-surface-container-low"
                        title="Edit name"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      {cat.is_active ?
                        <button
                          onClick={() => handleRemoveCategory(cat)}
                          disabled={isDemo || !canManage || categoriesReadOnly || categoryBusy || isLoading}
                          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-danger-border px-2.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg"
                          title="Archive category"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      : <button
                          onClick={() => handleRestoreCategory(cat)}
                          disabled={isDemo || !canManage || categoriesReadOnly || categoryBusy || isLoading}
                          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-2.5 text-xs font-semibold text-secondary hover:bg-surface-container-low"
                        >
                          Restore
                        </button>
                      }
                    </>
                  }
                </div>
              </div>
            );
          })}
          {!isLoading && categories.length === 0 && (
            <p className="p-6 text-center text-sm text-text-muted">{t("settings.noCategories")}</p>
          )}
        </div>
      </section>
      </div>

      <div id="settings-panel-data-tools" role="region" aria-labelledby="settings-nav-data-tools" hidden={activeSettingsSection !== "data-tools"}>
      <section id="data-tools" className="workspace-panel settings-section space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="settings-icon"><Download className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-semibold text-on-surface">{t("settings.dataTools")}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={localRecoveryInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Select a Shop Pro device recovery file"
              onChange={importLocalRecoveryBundle}
            />
            <button
              type="button"
              onClick={exportLocalRecoveryBundle}
              disabled={isDemo || !canRestoreDatabase(user?.role) || isExportingLocalData || isRestoringLocalData || exportBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low disabled:cursor-wait disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> {isExportingLocalData ? "Preparing…" : "Device recovery"}
            </button>
            <button
              type="button"
              onClick={() => localRecoveryInputRef.current?.click()}
              disabled={isDemo || !canRestoreDatabase(user?.role) || isRestoringLocalData || isExportingLocalData || exportBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low disabled:cursor-wait disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" /> {isRestoringLocalData ? "Restoring…" : "Restore device"}
            </button>
            <button
              type="button"
              disabled={isDemo || !canManage}
               onClick={() => setShowPaperImport(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low"
            >
              <Upload className="h-3.5 w-3.5" /> Import register
            </button>
            <button
              type="button"
              disabled={!canExport || exportBusy || isExportingLocalData || isRestoringLocalData}
              onClick={() => exportEverything("csv")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low"
            >
              <Download className="h-3.5 w-3.5" /> Transactions CSV
            </button>
            <button
              type="button"
              disabled={!canExport || exportBusy || isExportingLocalData || isRestoringLocalData}
              onClick={() => exportEverything("json")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"
            >
              <Download className="h-3.5 w-3.5" /> Transactions JSON
            </button>
          </div>
        </div>
      </section>
      </div>
        </div>
      </div>
    </div>
  );
};
