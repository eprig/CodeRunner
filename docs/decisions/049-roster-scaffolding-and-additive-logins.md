# 049 — User roster and additive sign-in methods

**Status:** Accepted  
**Date:** 2026-11-21

## Context

Earlier releases treated `data/allowlist.json` as the list of people who could
sign in, while Better Auth created a `user` row on first OAuth or username
sign-up. That made the allowlist and `user` table two sources of truth, allowed
self-service sign-up to create an unexpected second account, and gave a person
who signed in with both OAuth and a username two users and two workspaces.

We need coaches to enroll students before class, hand them a one-time
credential, and let those students add more sign-in methods later without
duplicating their identity or workspace. Separate account merging is a larger,
destructive operation and is not part of this change.

## Decision

**Better Auth's `user` table is the single roster row. Credentials and OAuth
accounts attach to that row; `data/allowlist.json` keeps only domain rules.**

1. **No separate identities table.** A coach's **Admin → Users → Add user**
   sheet creates a Better Auth `user` row through the internal adapter. The row
   may carry a username, a real email, or both. The sheet refuses an existing
   username/email; changing an existing row uses the per-user edit sheet. The
   backing API/CLI still upsert, so scripts can reuse a row without duplicating
   a user or workspace. New rows are always students; promotion uses the
   existing Users action.

2. **Temporary passwords.** The roster service generates a random password when
   one is not supplied (the admin Add sheet generates it in the browser and
   sends it explicitly) and stores only the Better Auth scrypt hash on a
   `credential` `account` row. The plaintext is returned once to the coach and
   is never logged. `mustChangePassword` is set on the user; until it is
   cleared, the control plane redirects page requests to `/account` and returns
   403 for other routes. The account page asks for the new password twice and
   calls `/roster/replace-temporary-password`; being signed in is enough, so a
   student who arrives through Google never has to type the one-time password.
   Better Auth's `/change-password`, `/set-password`, and `/sign-out` also stay
   reachable so the student can finish enrollment.

3. **Pending state.** A user is pending when `mustChangePassword` is true or
   they have no linked `account` rows. Admin → Users shows a **Pending** badge
   on those rows; there is no separate pending list. A user with only a domain
   rule remains pending until their first OAuth sign-in creates their row.

4. **Additive logins.** One person can hold a username, an email, a password,
   and one or more OAuth accounts. Account linking is enabled for configured
   trusted providers; `allowDifferentEmails: true` lets Google's verified
   address attach to a username-only row that still has the reserved
   `<username>@students.coderunner.invalid` address. In-app forms use Better
   Auth `/roster/claim-username` and `/roster/remove-password` (small plugin
   endpoints), `/set-password`, `linkSocial`, and Auth0 `oauth2.link`. Email is
   roster/provider-owned: `/change-email` is rejected by a hook. Public
   `/api/auth/sign-up/email` is rejected. Sign-in methods can only be removed
   while another one remains (decision 050).

5. **Domain rules stay file-backed.** `data/allowlist.json` retains only
   `domains`. On startup, legacy username/email entries are imported once into
   `user` rows and removed from the JSON; domains are preserved. Removing a
   roster identity also strips any matching legacy JSON entry so deletion is
   durable.

6. **Bootstrap admins are roster rows.** `CODERUNNER_ADMIN_EMAIL` and
   `CODERUNNER_ADMIN_USERNAME` provision/promote roster rows without creating
   file entries. Auth0 users keep their RBAC permission as the role authority.

7. **Deletion boundaries.** A pending roster row with no workspace can be
   removed from Admin → Users. Active users are also removed from Admin → Users,
   which stops their runtime and deletes their workspace. Account *merging*
   between two existing people remains future work: it must be admin-only and
   must be rejected when both users already own workspaces, since silently
   choosing a workspace to discard would destroy student data.

## Consequences

- There is one database row, one password credential set, and one workspace per
  person regardless of how many login methods they use.
- Removing a roster row revokes future sign-ins immediately; use Git or the
  workspace backup flow for student work that must survive.
- Operators manage people in Admin → Users (or the `allowlist` CLI) and
  domains in the same page or JSON file. Legacy email allowlist files are
  migrated automatically on the next start.
- Because public sign-up is gone, every username/password user must be created
  by a coach before they can sign in.
- Better Auth remains the owner of users, accounts, sessions, cookies, and
  password hashing. This change uses its internal adapter and endpoints rather
  than replacing them.

## Validation

- Backend auth/roster tests cover one-time hashes, forced password rotation,
  email-only first sign-in, additive email login, `revokeOtherSessions`
  behaviour, roster deletion, and bootstrap admins.
- E2E coverage walks coach add, temporary password, forced change, and
  username/password sign-in into the same workspace.
- `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:web`,
  `bun run e2e`, and `bun run e2e:security` pass.
