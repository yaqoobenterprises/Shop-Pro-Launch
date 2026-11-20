import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Globe, ShieldCheck } from "lucide-react";
import { Select } from "../common/Select";
import { useAuth } from "../../context/AuthContext";
import { useRegion } from "../../regional/region";
import { detectDeviceRegion } from "../../regional/detect";
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from "../../regional/currencies";
import { saveFirstRunCompanySetup } from "../../services/companySetupService";
import { prepareCompanySetup, type CompanySetupInput } from "../../lib/companySetupValidation";
import { saveUserPreferences } from "../../services/userPreferencesService";
import { useI18n } from "../../i18n";
import { isFeatureEnabled } from "../../config/features";

interface Props { isOpen: boolean; onClose: () => void }
const fieldClass = "workspace-control w-full min-h-11 rounded-lg px-3 py-2 text-sm";

export const FirstRunRegionalModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, organization, updateOrganization, isCloudAccount } = useAuth();
  const { setRegion } = useRegion();
  const { setLanguage, t } = useI18n();
  const languageUrEnabled = isFeatureEnabled("languageUr");
  const [detected] = useState(detectDeviceRegion);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<CompanySetupInput>(() => ({
    name: organization.name || "",
    businessCategory: organization.business_category || "",
    currency: organization.currency || detected.currency || "PKR",
    country: organization.country || detected.country || "Pakistan",
    timezone: organization.timezone || detected.timeZone || "Asia/Karachi",
  }));
  const [language, setLanguageChoice] = useState<"en" | "ur">(
    languageUrEnabled ? detected.uiLanguage : "en",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStep(0);
    setError(null);
    setInput({
      name: organization.name || "",
      businessCategory: organization.business_category || "",
      currency: organization.currency || detected.currency || "PKR",
      country: organization.country || detected.country || "Pakistan",
      timezone: organization.timezone || detected.timeZone || "Asia/Karachi",
    });
  }, [organization.id, organization.name, organization.business_category, organization.currency, organization.country, organization.timezone, detected]);

  if (!isOpen) return null;
  const change = (key: keyof CompanySetupInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setError(null);
  };
  const advance = () => {
    try {
      if (step === 0 && (input.name.trim().length < 2 || input.name.trim().length > 120)) {
        throw new Error("Enter a company name between 2 and 120 characters.");
      }
      if (step === 1) prepareCompanySetup(input);
      setError(null);
      setStep((current) => Math.min(current + 1, 2));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the company details.");
    }
  };
  const submit = async () => {
    if (!user || user.role !== "OWNER" || !organization.id || saving) {
      setError("Only the company owner can finish setup.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveFirstRunCompanySetup({
        userId: user.id, organization, isCloudAccount, input,
      });
      updateOrganization(saved);
      setRegion({
        currency: saved.currency, currencySymbol: saved.currency_symbol,
        timeZone: saved.timezone, country: saved.country,
        ...(languageUrEnabled ? { uiLanguage: language } : {}),
      });
      if (languageUrEnabled) {
        setLanguage(language);
        // Language is a user preference, separate from verified company metadata.
        await saveUserPreferences(user.id, organization.id, { language });
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("region.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const steps = ["Company", "Location & currency", "Review"];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-6">
      <div className="workspace-panel max-h-[92dvh] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl p-5 shadow-2xl sm:p-7">
        <header className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Building2 aria-hidden="true" className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="setup-title" className="text-lg font-bold text-on-surface">Set up your company</h2>
            <p className="mt-1 text-sm text-text-muted">
              Configure the basics before recording your first transaction.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2" aria-label="Company setup progress">
          {steps.map((name, index) => (
            <div key={name} className="min-w-0 space-y-1.5">
              <div className={`h-1.5 rounded-full ${index <= step ? "bg-primary" : "bg-border-standard"}`} />
              <span className={`block text-xs ${index === step ? "font-semibold text-on-surface" : "text-text-muted"}`}>
                {name}
              </span>
            </div>
          ))}
        </div>
        <p aria-live="polite" className="text-xs text-text-muted">Step {step + 1} of 3</p>

        {error && <div role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger">
          {error}
        </div>}

        {step === 0 && (
          <section className="space-y-4" aria-label="Company details">
            <div className="space-y-1.5">
              <label htmlFor="company-setup-name" className="text-sm font-semibold text-on-surface">Company name</label>
              <input id="company-setup-name" autoComplete="organization" maxLength={120}
                value={input.name} onChange={(event) => change("name", event.target.value)}
                className={fieldClass} placeholder="Example Trading Company" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="company-setup-type" className="text-sm font-semibold text-on-surface">
                Business type <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input id="company-setup-type" maxLength={80} value={input.businessCategory}
                onChange={(event) => change("businessCategory", event.target.value)}
                className={fieldClass} placeholder="Services, Retail, Wholesale..." />
            </div>
            <p className="text-xs text-text-muted">Each company needs its own verified owner and records.</p>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4" aria-label="Location and currency">
            <div className="space-y-1.5">
              <label htmlFor="company-setup-currency" className="text-sm font-semibold text-on-surface">Accounting currency</label>
              <Select id="company-setup-currency" value={input.currency}
                disabled={!isCloudAccount}
                onChange={(event) => change("currency", event.target.value)} className={fieldClass}>
                {SUPPORTED_CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                ))}
              </Select>
              <p className="text-xs text-text-muted">
                Currency and timezone changes are locked after financial entries are posted.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="company-setup-country" className="text-sm font-semibold text-on-surface">Country</label>
              <input id="company-setup-country" value={input.country} maxLength={100}
                onChange={(event) => change("country", event.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="company-setup-timezone" className="text-sm font-semibold text-on-surface">Business timezone</label>
              <input id="company-setup-timezone" value={input.timezone} disabled={!isCloudAccount}
                onChange={(event) => change("timezone", event.target.value)}
                className={fieldClass} placeholder="Asia/Karachi" />
            </div>
            {languageUrEnabled && <div className="space-y-1.5">
              <label htmlFor="company-setup-language" className="text-sm font-semibold text-on-surface">Language</label>
              <Select id="company-setup-language" className={fieldClass} value={language}
                onChange={(event) => setLanguageChoice(event.target.value as "en" | "ur")}>
                <option value="en">English</option><option value="ur">Urdu</option>
              </Select>
            </div>}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4" aria-label="Review company setup">
            <div className="rounded-xl border border-border-standard p-4">
              <h3 className="mb-3 text-sm font-semibold text-on-surface">Confirm company details</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ["Company", input.name.trim()],
                  ["Business type", input.businessCategory.trim() || "Not set"],
                  ["Currency", `${input.currency} (${getCurrencyConfig(input.currency)?.symbol || input.currency})`],
                  ["Country", input.country.trim()],
                  ["Timezone", input.timezone.trim()],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="break-all text-right font-medium text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex items-start gap-2 text-sm text-text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p>No opening balances or accounting transactions will be created.
                Chart of Accounts, fiscal year and opening balances are separate verified steps.</p>
            </div>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-standard pt-4">
          <button type="button" disabled={step === 0 || saving}
            onClick={() => { setStep((current) => Math.max(current - 1, 0)); setError(null); }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-standard px-4 text-sm font-semibold text-on-surface disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
          {step < 2 ? (
            <button type="button" onClick={advance}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover">
              Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={saving || user?.role !== "OWNER"}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50">
              <Check className="h-4 w-4" aria-hidden="true" />
              {saving ? "Saving company..." : "Confirm & continue"}
            </button>
          )}
        </footer>
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <Globe className="h-4 w-4" aria-hidden="true" />
          {isCloudAccount ? "Company setup requires a verified cloud session." : "Local-only company: currency changes require review."}
        </p>
      </div>
    </div>
  );
};
