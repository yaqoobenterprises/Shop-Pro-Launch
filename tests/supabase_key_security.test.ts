import { describe, expect, it } from 'vitest';
import { isServerSupabaseKey } from '../src/lib/supabaseSecurity';

function jwtWithRole(role: string): string {
  const payload = btoa(JSON.stringify({ role }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `header.${payload}.signature`;
}

describe('Supabase browser key safety', () => {
  it('rejects current secret keys and legacy service-role JWTs', () => {
    expect(isServerSupabaseKey('sb_secret_test_only')).toBe(true);
    expect(isServerSupabaseKey(jwtWithRole('service_role'))).toBe(true);
  });

  it('allows publishable keys and legacy anon JWTs', () => {
    expect(isServerSupabaseKey('sb_publishable_test_only')).toBe(false);
    expect(isServerSupabaseKey(jwtWithRole('anon'))).toBe(false);
    expect(isServerSupabaseKey('')).toBe(false);
  });
});
