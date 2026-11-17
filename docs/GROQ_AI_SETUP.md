# Groq Cloud AI setup

Shop Pro's AI Accountant can use Groq Cloud instead of running Ollama on the shop PC. The browser calls the same-origin `/api/ai-chat` Vercel function; the function verifies the signed-in Supabase user and keeps the Groq API key on the server.

## Vercel environment variables

Add these variables in the Vercel project's Settings → Environment Variables, for Production and Preview as needed:

- `GROQ_API_KEY` — create a key in the Groq Console. Keep it secret; never add it to a `VITE_` variable or commit it to Git.
- `VITE_SUPABASE_URL` — existing Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — existing browser-safe Supabase publishable key. The API uses it only to validate the user's access token.
- Optional: `GROQ_MODEL` — defaults to `openai/gpt-oss-20b`.

After saving environment variables, redeploy the Vercel project so the function receives them.

## Runtime behavior

- The endpoint accepts only authenticated Supabase sessions.
- The Groq key is used only in the server function and is never returned to the browser.
- The AI receives the user's current Shop Pro summary and the additional report context assembled for the question. Up to 30 transaction rows are included only when the question appears to ask about transactions or entries.
- Chat history remains in the existing Supabase chat tables and browser cache. It is not stored by this API function.
- The model has no tools or database connection. It cannot post, edit, or delete ledger transactions.
- Groq's Free plan is rate-limited, not unlimited. When the account reaches a limit, the endpoint returns a temporary limit message; no paid fallback is configured.
- The PC does not need to be on for Cloud AI. All devices still need internet access and a valid Shop Pro sign-in.

## Privacy note

When Cloud AI is used, the context and chat messages sent with that request are transmitted to Groq for inference. Do not send passwords, payment credentials, CNICs, or unrelated personal information in chat. Review Groq's current data controls and terms before using real customer-sensitive records.

## Local development

For local development, the Vercel function needs the same server environment variables. Run the app with Vercel's local development tooling or deploy a Preview environment; do not place `GROQ_API_KEY` in a browser-exposed `VITE_` variable.
