/** Returns true when a Supabase key is intended for server-side use. */
export function isServerSupabaseKey(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  if (/^sb_secret_/i.test(normalized) || /^service_role\b/i.test(normalized)) {
    return true;
  }

  const payload = normalized.split('.')[1];
  if (!payload) return false;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof claims.role === 'string' && claims.role.toLowerCase() === 'service_role';
  } catch {
    return false;
  }
}
