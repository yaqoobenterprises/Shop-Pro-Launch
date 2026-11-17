import { getSecurityPrincipal } from '../lib/security';
import { hasConfiguredCloudSession, isSupabaseConfigured, SupabaseSessionRequiredError } from '../lib/supabase';
import { DEMO_ORGANIZATION_ID, isDemoSessionActive } from './demoModeService';

export interface LedgerReadOptions {
  /** Fail instead of silently returning cached/offline data for exact financial answers. */
  requireCloudSource?: boolean;
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function isDemoOrganization(organizationId?: string): boolean {
  return organizationId === DEMO_ORGANIZATION_ID || isDemoSessionActive();
}

export async function requireAuthoritativeCloudRead(
  principal: ReturnType<typeof getSecurityPrincipal>,
  resource: string,
): Promise<void> {
  if (!principal) throw new Error(`Sign in before loading ${resource} from the cloud.`);
  if (isDemoOrganization(principal.organizationId)) {
    throw new Error(`Complete ${resource} are not available in demo mode.`);
  }
  if (!isOnline()) throw new Error(`Reconnect before loading complete ${resource}.`);
  if (!isSupabaseConfigured()) throw new Error(`Cloud data is not configured; complete ${resource} cannot be verified.`);
  if (!(await hasConfiguredCloudSession(principal.id))) throw new SupabaseSessionRequiredError();
}
