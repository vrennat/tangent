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
- Passkey (WebAuthn, `@simplewebauthn` v13): `…/passkey/register/{options,verify}` (auth
  required), `…/passkey/login/{options,verify}` (passwordless, discoverable credentials).
  RP ID/origin derived from the request URL (`localhost` dev, `tangent.page` prod). Challenge
  stored in D1 keyed by an opaque id the client round-trips; public keys stored base64url.
  Passkey is a credential ADDED to an email-verified account (no recovery cliff).

`hooks.server.ts` resolves the session (cookie or `Authorization: Bearer`) into
`locals.user` on every request; the feed works signed-out.

## Status

- **DONE + verified** (commits `85756eb`, `c7f3df4`; 115 tests green, 0 type errors):
  - Server: D1 schema, email-code auth, sessions, profile sync (pull/push/merge).
  - Web client: auth store, sign-in UI in the interests drawer, revision-guarded sync.
  - Real-browser verified (Chrome on `vite dev`): email login sets an HttpOnly cookie that
    auto-sends on reload (-> signed-in), merge pushed the local 35-token interest vector to
    D1, "Interests synced" indicator correct.
- **DONE (server + web UI) + partially verified** — passkey (WebAuthn): register/login
  endpoints + "Add a passkey" (signed-in) / "Sign in with a passkey" (signed-out) UI.
  Curl-verified the options + challenge-storage halves and the auth guard; the UI renders
  signed-in. **The verify halves (attestation/assertion) need a real authenticator** — can't
  drive a CDP virtual authenticator from this harness, so test passkey create/use on a device.
- **TODO:** iOS native (email code is trivial — bearer token in keychain; passkey =
  ASAuthorization + an `apple-app-site-association` at tangent.page, the separate chunk in
  memory). Remote provisioning (see below).

## Provisioning status (2026-06-13)

- **Remote D1: DONE.** `tangent-db` created (id `7132ea8c-8a8c-4182-ab34-dabf2202341f`,
  region WNAM), migration applied `--remote`, all 6 tables verified. `database_id` is in
  `wrangler.jsonc`.
- **Email: native CF Email Sending chosen** (Tanner is on Workers Paid). `send_email` binding
  `EMAIL` (remote:true) wired; `email.ts` targets the Email Service object API (verified).
  **One step left, dashboard-only:** enable Email Sending on tangent.page (Compute → Email
  Service → Email Sending → Onboard Domain → tangent.page; adds SPF/DKIM/DMARC — tangent.page
  has none today, so no conflict). The beta `wrangler email sending enable` endpoint 404s on
  4.98/4.100, so the CLI can't do it. Other zones (cresset.app, birdup.net) are already enabled.
- **Deploy:** not done. `bun run build` passes for Workers. Deploy is `bunx wrangler deploy`
  from this branch (or merge to main first) — separate, confirm-first.
- **Passkey** RP ID = `tangent.page`; verify halves need a real authenticator (device test).
- **iOS client: deferred to backlog** (per Tanner, 2026-06-13).
