import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isServerSupabaseKey } from './supabaseSecurity';

export function normalizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  // Strip trailing /rest/v1 or /rest/v1/ if user pasted REST endpoint URL
  url = url.replace(/\/rest\/v1\/?$/i, '');
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  return url;
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const candidateKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    '';
  const rawKey = isServerSupabaseKey(candidateKey) ? '' : candidateKey;
  return {
    url: normalizeSupabaseUrl(rawUrl),
    anonKey: rawKey.trim(),
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url &&
      anonKey &&
      url.startsWith('https://') &&
      !url.includes('your-project.supabase.co') &&
      !url.includes('your-tenant-id.supabase.co') &&
      !anonKey.toLowerCase().includes('sb_secret_') &&
      !anonKey.toLowerCase().includes('service_role') &&
      !anonKey.includes('your-anon-key') &&
      !anonKey.includes('your-publishable-key')
  );
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig();
const supabaseInstance = createClient(
  supabaseUrl || 'https://offline.invalid',
  supabaseAnonKey || 'offline-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function getSupabaseClient(): SupabaseClient {
  return supabaseInstance;
}

export class SupabaseSessionRequiredError extends Error {
  constructor() {
    super('Your cloud session is missing or has expired. Sign in again to load shop data.');
    this.name = 'SupabaseSessionRequiredError';
  }
}

/** Prevent cloud requests from falling back to the public anon role. */
export async function hasActiveSupabaseSession(userId?: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    const session = data.session;
    return Boolean(
      !error &&
      session?.access_token &&
      session.user.id &&
      (!userId || session.user.id === userId),
    );
  } catch {
    return false;
  }
}

export async function hasConfiguredCloudSession(userId?: string): Promise<boolean> {
  return Boolean(userId && (typeof navigator === 'undefined' || navigator.onLine) && isSupabaseConfigured() && await hasActiveSupabaseSession(userId));
}

export function formatSupabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!supabaseUrl) {
    return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.';
  }
  if (message.toLowerCase().includes('failed to fetch')) {
    return `Cannot reach Supabase at ${supabaseUrl}. Check internet access and project status.`;
  }
  return message || 'Supabase request failed';
}
