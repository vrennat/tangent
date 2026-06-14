# Tangent Accounts — Design

_2026-06-13. Branch `worktree-accounts`._

## Goal

Let a reader's taste profile survive across devices and a localStorage wipe, by syncing
the **persistent** half of the engagement profile to the server behind a real account.
Web and native iOS share one server-side auth + sync surface.

## Decisions (the why, not just the what)

- **Client stays the source of truth; D1 is a sync/backup target.** The feed brain
  (`/api/next`) remains stateless — it scores against the interest vector sent in the
  request body. Moving profile *state* server-side would be a regression and isn't needed
  for cross-device sync. (Confirmed against the existing split in `profile.svelte.ts`.)
- **Email is the recoverable anchor; passkeys hang off it.** Chosen auth = passkey primary
  **+ email recovery**. We build the email anchor first: a passkey bolted onto nothing has
  a recovery cliff (lose devices -> locked out); a passkey added to an email-verified
  account does not. So the account is created/recovered by email code, and a passkey is a
  credential you *add* for fast re-login.
- **Only the persistent half syncs.** `Persisted` (interest vector + title sets + taste)
  is shared in `src/lib/engagement/persisted.ts` and used by both the client profile and
  the server merge. The ephemeral session (`seenTitles`/`recentTokens`) is never synced.
- **First-login merge is the merge that matters.** When a device's local profile and the
  server's stored profile both hold real history, neither may clobber the other:
  `mergePersisted` unions the title sets and takes the per-key **MAX** of token weights /
  doc-freq / dwell (they're capped running sums — summing would double-count the same
  article seen on two devices). Steady-state single-device push is plain last-write-wins.
- **Tokens never stored in the clear.** Session tokens and email codes are stored as
  SHA-256 hashes; a DB read leak can't be replayed. Codes are single-use, 10-min TTL,
  5-attempt cap. Sessions are 90 days, revocable, hashed-token lookup.
- **Cloudflare types are imported, not globally referenced.** A global
  `/// <reference @cloudflare/workers-types />` swaps `Response.json()` to return `unknown`
  and breaks browser fetch typing. Server files import `D1Database` explicitly.

## Schema (`migrations/0001_accounts.sql`)

`users` (email-anchored) · `sessions` (hashed token, revocable) · `email_tokens` (hashed
codes) · `credentials` (WebAuthn passkeys) · `webauthn_challenges` (pending ceremonies) ·
`profiles` (one JSON `Persisted` blob per user + `updated_at` + `revision`).

## API

- `POST /api/auth/request-code` — find-or-create account, mint+send a 6-digit code.
  Generic `{ ok }` (no account enumeration); `devCode` returned only in dev.
- `POST /api/auth/verify-code` — verify, mark verified, mint session. Web -> HttpOnly
  cookie; iOS (`client:'ios'`) -> raw token for the keychain.
- `POST /api/auth/logout` · `GET /api/auth/me`.
- `GET /api/profile` · `PUT /api/profile` (LWW) · `POST /api/profile/merge` (first login).
- Passkey (TODO): `…/passkey/register/{options,verify}`, `…/passkey/login/{options,verify}`.

`hooks.server.ts` resolves the session (cookie or `Authorization: Bearer`) into
`locals.user` on every request; the feed works signed-out.

## Status

- **DONE + verified** (commits `85756eb`, `c7f3df4`; 115 tests green, 0 type errors):
  - Server: D1 schema, email-code auth, sessions, profile sync (pull/push/merge).
  - Web client: auth store, sign-in UI in the interests drawer, revision-guarded sync.
  - Real-browser verified (Chrome on `vite dev`): email login sets an HttpOnly cookie that
    auto-sends on reload (-> signed-in), merge pushed the local 35-token interest vector to
    D1, "Interests synced" indicator correct.
- **TODO:** passkey (WebAuthn) register/login endpoints + web "add a passkey" UI; iOS native
  (email code is trivial; passkey = ASAuthorization + AASA — the separate chunk in memory).

## Open infra items (need Tanner)

1. `wrangler d1 create tangent-db` (remote) — on the confirm-first list. Local dev works
   today against Miniflare; the `database_id` in `wrangler.jsonc` is a placeholder.
2. Email transport for prod: Cloudflare Email Sending is **Workers Paid plan** only and
   needs tangent.page onboarded (auto SPF/DKIM/DMARC). If not on Paid, fall back to Resend
   free tier (one external dep). Dev surfaces the code in-response, so this gates prod only.
3. Passkey RP ID = `tangent.page`; iOS needs an `apple-app-site-association` at the domain.
