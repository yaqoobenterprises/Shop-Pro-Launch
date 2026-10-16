import { getSupabaseClient } from '../lib/supabase';

export type EntryMode = 'chat' | 'standard' | 'both';
export type AppLanguage = 'en' | 'ur';

export interface UserPreferences {
  entry_mode: EntryMode;
  language: AppLanguage;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  entry_mode: 'chat',
  language: 'en',
};

function getDeviceLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') return DEFAULT_PREFERENCES.language;
  const firstLanguage = navigator.languages?.[0] ?? navigator.language;
  return firstLanguage?.toLowerCase().startsWith('ur') ? 'ur' : 'en';
}

function getLocalPreferences(userId: string): UserPreferences {
  let language: AppLanguage = getDeviceLanguage();
  let entry_mode: EntryMode = DEFAULT_PREFERENCES.entry_mode;

  try {
    const savedLang = localStorage.getItem('shop-pro:ui-lang');
    if (savedLang === 'en' || savedLang === 'ur') {
      language = savedLang;
    }
    const savedMode = localStorage.getItem(`shop-pro:entry-mode:${userId}`);
    if (savedMode === 'chat' || savedMode === 'standard' || savedMode === 'both') {
      entry_mode = savedMode;
    }
  } catch {
    // Storage access unavailable
  }

  return { entry_mode, language };
}

function saveLocalPreferences(userId: string, prefs: Partial<UserPreferences>): void {
  try {
    if (prefs.language) {
      localStorage.setItem('shop-pro:ui-lang', prefs.language);
    }
    if (prefs.entry_mode) {
      localStorage.setItem(`shop-pro:entry-mode:${userId}`, prefs.entry_mode);
    }
  } catch {
    // Storage access unavailable
  }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const local = getLocalPreferences(userId);
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('user_preferences')
      .select('entry_mode, language')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return local;
    }

    const row = data as { entry_mode?: string; language?: string };
    const entry_mode = (row.entry_mode as EntryMode) || local.entry_mode;
    const language = (row.language as AppLanguage) || local.language;
    saveLocalPreferences(userId, { entry_mode, language });
    return { entry_mode, language };
  } catch {
    return local;
  }
}

export async function saveUserPreferences(
  userId: string,
  organizationId: string,
  prefs: Partial<UserPreferences>,
): Promise<void> {
  saveLocalPreferences(userId, prefs);

  try {
    const client = getSupabaseClient();
    await client
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          organization_id: organizationId,
          ...prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  } catch {
    // Silent fallback to local storage
  }
}
