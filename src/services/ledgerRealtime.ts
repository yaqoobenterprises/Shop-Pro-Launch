import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSecurityPrincipal } from '../lib/security';
import { getSupabaseClient, hasActiveSupabaseSession, isSupabaseConfigured } from '../lib/supabase';

export function subscribeToLiveTransactionsForUser(onPayload: (payload: any) => void): () => void {
  const principal = getSecurityPrincipal();
  if (!principal || !isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) return () => {};

  const supabase = getSupabaseClient();
  let active = true;
  let channel: RealtimeChannel | null = null;
  void hasActiveSupabaseSession(principal.id).then((hasSession) => {
    if (!hasSession || !active) return;
    channel = supabase
      .channel('public:transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onPayload)
      .subscribe();
  });
  return () => {
    active = false;
    if (channel) void supabase.removeChannel(channel);
  };
}
