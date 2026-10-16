import React, { useState, useEffect } from 'react';
import { User, MessageSquare, FormInput, Sliders, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegion } from '../../regional/region';
import { useI18n } from '../../i18n';
import { useApp } from '../../context/AppContext';
import { useFeature } from '../../config/features';
import {
  getUserPreferences,
  saveUserPreferences,
  EntryMode,
  AppLanguage,
} from '../../services/userPreferencesService';

export const UserPreferencesSection: React.FC = () => {
  const { user, organization } = useAuth();
  const { region, setRegion } = useRegion();
  const { setEntryMode: setAppEntryMode } = useApp();
  const { t, setLanguage: setI18nLanguage } = useI18n();
  const languageUrEnabled = useFeature('languageUr');
  const entryModesEnabled = useFeature('entryModes');

  const [entryMode, setEntryMode] = useState<EntryMode>('chat');
  const [language, setSelectedLanguage] = useState<AppLanguage>('en');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadPrefs() {
      if (!user?.id) return;
      const prefs = await getUserPreferences(user.id);
      if (isMounted) {
        setEntryMode(entryModesEnabled ? prefs.entry_mode : 'chat');
        setSelectedLanguage(languageUrEnabled ? prefs.language : 'en');
      }
    }
    void loadPrefs();
    return () => {
      isMounted = false;
    };
  }, [user?.id, languageUrEnabled, entryModesEnabled]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !organization?.id) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const preferences = {
        ...(entryModesEnabled ? { entry_mode: entryMode } : {}),
        ...(languageUrEnabled ? { language } : {}),
      };
      await saveUserPreferences(user.id, organization.id, preferences);

      if (entryModesEnabled) setAppEntryMode(entryMode);
      if (languageUrEnabled) {
        setRegion({ uiLanguage: language });
        setI18nLanguage(language);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!languageUrEnabled && !entryModesEnabled) return null;

  return (
    <section id="user-preferences" className="workspace-panel settings-section p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="settings-icon">
          <User className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">
            {languageUrEnabled && entryModesEnabled
              ? `${t('settings.language')} & ${t('settings.entryMode')}`
              : languageUrEnabled
                ? t('settings.language')
                : t('settings.entryMode')}
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {t('settings.preferenceDescription')}
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-success-bg border border-success-border p-3 text-xs text-success">
          <Check className="h-4 w-4 shrink-0" />
          <span>{t('settings.preferencesUpdated')}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 w-full max-w-lg text-xs">
        {/* Language Selection */}
        {languageUrEnabled && <div>
          <label htmlFor="user-pref-lang" className="block font-semibold text-secondary mb-1">
            {t('settings.language')}
          </label>
          <select
            id="user-pref-lang"
            value={language}
            onChange={(e) => {
              const nextLanguage = e.target.value as AppLanguage;
              setSelectedLanguage(nextLanguage);
              setI18nLanguage(nextLanguage);
              setRegion({ uiLanguage: nextLanguage });
            }}
            className="workspace-control w-full min-h-10 px-3 py-2 text-xs"
          >
            <option value="en">{t('settings.languageEnglish')}</option>
            <option value="ur">{t('settings.languageUrdu')}</option>
          </select>
        </div>}

        {/* Entry Mode Selection */}
        {entryModesEnabled && <div>
          <span className="block font-semibold text-secondary mb-2">
            {t('settings.entryMode')}
          </span>
          <div className="space-y-2">
            {[
              {
                id: 'chat',
                label: t('settings.chatMode'),
                desc: t('settings.chatModeDesc'),
                icon: MessageSquare,
              },
              {
                id: 'standard',
                label: t('settings.standardMode'),
                desc: t('settings.standardModeDesc'),
                icon: FormInput,
              },
              {
                id: 'both',
                label: t('settings.bothModes'),
                desc: t('settings.bothModesDesc'),
                icon: Sliders,
              },
            ].map(({ id, label, desc, icon: Icon }) => (
              <label
                key={id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  entryMode === id
                    ? 'border-primary/40 bg-primary/[0.04]'
                    : 'border-border-standard bg-surface-bright hover:bg-surface-container-low'
                }`}
              >
                <input
                  type="radio"
                  name="entry_mode"
                  value={id}
                  checked={entryMode === id}
                  onChange={() => setEntryMode(id as EntryMode)}
                  className="mt-0.5 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-on-surface">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span>{label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>}

        <div className="pt-1">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary rounded-xl font-semibold text-xs transition"
          >
            {isSaving ? t('settings.saving') : t('settings.savePreferences')}
          </button>
        </div>
      </form>
    </section>
  );
};
