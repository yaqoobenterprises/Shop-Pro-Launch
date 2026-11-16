# AI Accountant — Local-First Architecture

## Agreed operating model

The AI model runs on the shop's own PC/laptop. When Shop Pro is in use and the PC is on,
the local model is available. When the PC is off, AI replies pause. No VPS, paid AI API,
or always-on cloud inference is part of this design.

Restarting the PC must not reset the business. Shop Pro's database remains the source of
truth for transactions and reports; chat history and durable assistant preferences must be
stored separately in persistent Shop Pro storage so they can be loaded again next day.

## Components

1. **Shop Pro UI** — existing React chat surface; AI conversation is a separate mode from
   transaction-entry parsing.
2. **Local inference bridge** — `local-ai/server.py`, bound to loopback only.
3. **Ollama** — serves the open-source model on the same PC.
4. **Shop Pro services** — authenticated, organization-scoped data retrieval and existing
   permission-checked transaction workflows.
5. **Persistent history** — stored by Shop Pro, not in the model process or RAM.

## Non-negotiable safety rules

- The model never connects directly to Supabase and never receives database credentials.
- Financial answers must be grounded in data returned by Shop Pro services; no invented totals.
- The model cannot execute SQL, shell commands, arbitrary URLs, or unrestricted function calls.
- Read actions use existing organization-scoped services and the signed-in user's permissions.
- Write actions create a preview/draft and require explicit confirmation before the existing
  Shop Pro posting flow is called.
- Edits, voids, and restores continue to use existing authorization checks and audit history.
- Do not present trial balance, full balance sheet, depreciation, accrual, or provision reports
  as available until the underlying accounting data model and calculations exist.

## Delivery stages

1. **Local runtime foundation** — Ollama bridge, health check, safe request schema. (Scaffold added.)
2. **Chat UI and durable history** — add an AI conversation mode without disrupting transaction entry;
   persist messages across app/PC restarts and scope them to the signed-in organization/user.
3. **Read-only financial tools** — expose narrowly scoped reports from existing ledger services:
   daily/monthly totals, category/service breakdowns, account balances and transaction search.
4. **Controlled transaction assistant** — parse a proposed entry, show a review card, then use
   the existing draft/post path only after confirmation.
5. **Full accounting engine** — chart of accounts, balanced journal entries, trial balance,
   balance sheet, depreciation, accruals and provisions. This requires a separately reviewed
   schema and migration plan; do not retrofit by guessing from payment-account ledgers.

## Current limitation

Shop Pro's existing chat view is primarily a transaction-entry and ledger feed. The current
ledger/account views do not by themselves constitute a complete double-entry general ledger.
The AI must accurately disclose these limits until the accounting engine is implemented.
