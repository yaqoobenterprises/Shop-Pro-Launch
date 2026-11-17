# LedgerMate AI: Groq Cloud setup

LedgerMate AI uses Groq Cloud through the same-origin `/api/ai-chat` Vercel function. The function verifies the signed-in Supabase user with Supabase Auth and keeps the Groq API key on the server.

## Vercel environment variables

Add these variables in the Vercel project's Settings → Environment Variables, for Production and Preview as needed:

- `GROQ_API_KEY` — create a key in the Groq Console. Keep it secret; never add it to a `VITE_` variable or commit it to Git.
- `VITE_SUPABASE_URL` — existing Supabase project URL (or configure the server-only alias `SUPABASE_URL`).
- `VITE_SUPABASE_PUBLISHABLE_KEY` — existing browser-safe Supabase publishable key (or server-only alias `SUPABASE_ANON_KEY`). The API uses it only to validate the user's access token.
- Optional: `GROQ_MODEL` — defaults to `openai/gpt-oss-20b`.

After saving environment variables, redeploy the Vercel project so the function receives them.

## Runtime behavior

- The endpoint accepts only authenticated Supabase sessions and uses no service-role key.
- The Groq key is used only in the server function and is never returned to the browser.
- Ledger context is retrieved through existing Shop Pro ledger services under the signed-in user's organization and current RLS rules. Date-range totals use the existing monthly report services; transaction detail and service keyword searches use the existing paginated ledger query.
- Chat history is kept in the RLS-protected Supabase chat tables and a browser-local cache. The API function does not persist chat messages.
- The model has no tools or database connection. Shop Pro may prepare income, expense, amount-edit, or void actions; each requires a field preview and an explicit confirmation before calling the existing ledger service. Voids retain audit history.
- Groq's Free plan is rate-limited, not unlimited. When the account reaches a limit, the endpoint returns a temporary limit message; no paid fallback is configured.
- The PC does not need to be on for Cloud AI. All devices still need internet access and a valid Shop Pro sign-in.

## Multi-conversation history rollout

The additive migration `supabase/migrations/20261117054753_ledgermate_multi_conversation_history.sql` removes the unique constraint that allowed only one conversation for each organization/user pair and adds an index for listing that user's conversations by recent activity. It keeps existing conversation and message rows, the separate identity constraint, grants, and all RLS policies. It does not touch financial records. Apply it through the repository's normal Supabase migration review and rollout process before expecting multiple synced conversations; until then the UI can fall back to device-local chat history. This repository change does not apply the migration to a live database.

## Privacy note

When Cloud AI is used, the context and chat messages sent with that request are transmitted to Groq for inference. Do not send passwords, payment credentials, CNICs, or unrelated personal information in chat. Review Groq's current data controls and terms before using real customer-sensitive records.

## Local development

For local development, the Vercel function needs the same server environment variables. Run the app with Vercel's local development tooling or deploy a Preview environment; do not place `GROQ_API_KEY` in a browser-exposed `VITE_` variable.
