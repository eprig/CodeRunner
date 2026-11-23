# 050 — Account sign-in method management

**Status:** Accepted  
**Date:** 2026-11-22

## Context

Decision 049 made the Better Auth `user` row the single roster row and let
students attach usernames, emails, passwords, and OAuth accounts additively.
The first account page exposed raw forms for every primitive, including a manual
email change and one-click provider links with no way to remove them. That is
confusing for students and makes it possible to remove the only working sign-in
method and get locked out.

Admins also had a separate **Allowlist** tab that mixed two unrelated ideas: a
list of pending people (who are just `user` rows) and a few email-domain rules.

## Decision

1. **Email is roster/provider-owned.** `/api/auth/change-email` is rejected by
   a `before` hook with a clear message. The account page shows the address
   read-only inside the Google provider card (or in the username/password card
   when Google isn't configured), not in a separate email card. Coaches set it
   when they provision a row; Google supplies a verified address when linked. A
   username-only row keeps its reserved
   `<username>@students.coderunner.invalid` address. OAuth linking uses
   `allowDifferentEmails: true` so that reserved address does not block linking
   a real Google account.

2. **Connections are visible and explicit.** The account page lists each
   configured OAuth provider with a Connected / Not connected badge. Linking
   uses a `Link Google` (or GitHub / Auth0) button; disconnecting requires its
   own `Disconnect` button rather than happening as a side effect of signing
   in with a different method. Username and password are added in one form with
   both fields; a `Change password` button in the same card reveals the ordinary
   current/new password form. There is no separate password form at the top of
   the page. Adding the password uses `/api/auth/roster/set-password`, a custom
   endpoint: Better Auth 1.6.10 exports `setPassword` without a routed path, so
   `/api/auth/set-password` does not exist.

3. **Never remove the last way in.** A `before` hook on `/unlink-account` counts
   the linked `account` rows and rejects a disconnect that would leave none,
   whatever their providers. It still rejects direct `/unlink-account` calls for
   the credential row so `username` cannot be stranded. `/roster/remove-password`
   deletes the credential account and clears `username` together, and likewise
   requires another account. The account page disables the corresponding buttons
   with an explanation when the last method would be lost, but the server is the
   authority. Removing a method does not show a confirmation popup; the blocked
   final case is communicated inline and at the endpoint.

4. **The account page has a Back button** returning to the workspace root, so
   it does not strand a student who followed the forced-password-change link.

5. **Admin → Users owns everything about people.** The Allowlist tab is gone.
   Add user opens a sheet that only creates new student rows; each row's Actions
   dropdown opens sheets/actions for Edit, Reset password, Promote/Demote, and
   Remove, with an icon on every item. Role is a badge beside the name only for
   admins, replacing the Role column; Pending is a badge in the table rather
   than its own section, and an established user whose password was reset gets
   a **Password reset** badge instead, since they still have a sign-in method.
   The signed-in admin's own row has no actions; self-editing
   would bypass safeguards enforced elsewhere, so the user-management endpoints
   (including the legacy allowlist API) return 409 for the caller's own user id.
   Allowed email domains live behind a top-level Domains
   button and sheet. Both identity sheets require at least one credential:
   a new user needs a username or email, and an existing user cannot have both
   cleared. The `/admin/allowlist` HTTP endpoints remain as the backing API for
   domain rules and roster scaffolding so CLI and older tooling keep working.
   The Add sheet sends `createOnly: true` so a second Add cannot modify an
   existing row; edits use `POST /admin/users/:id/identity`. Both sheets label
   their fields. The Add sheet requires a temporary password of at least 8
   characters: **Generate** fills a random one that can still be edited, and an
   eye button toggles visibility. The Edit sheet also changes the display name
   (`user.name`); a blank display name leaves the current one alone. The backing
   API/CLI may still omit the password, in which case the roster service
   generates it, but the admin UI never sends a blank one.

6. **Forced password rotation never asks for the old password.** A signed-in
   session is already proof of identity, whether it was created with the
   temporary password or through Google. The forced-change form lives in the
   username/password card, asks for the new password twice, and posts to
   `/api/auth/roster/replace-temporary-password`, which requires
   `mustChangePassword`, matches the two entries, replaces the credential hash,
   clears the flag, and refreshes the session cookie. The ordinary Change
   password form revealed by the card's button still requires the current
   password.

## Consequences

- Students can safely swap between password and OAuth sign-in methods without
  creating duplicate users or workspaces.
- A coach can no longer create an admin directly from Add user; promotion is a
  deliberate second action on an existing row. Editing an identity cannot reset
  a password or move the user's workspace, and it cannot remove the last sign-in
  identity.
- Domain rules are still file-backed and still configurable from the UI, via the
  Domains button on the Users page rather than a separate tab or a bottom card.
- `allowDifferentEmails: true` is limited to trusted providers; the OAuth
  provider still proves ownership of the new address.

## Validation

- Backend auth tests cover the disabled email-change endpoint, one-way removal
  of username/password, the count-based unlink guard, and admin self-edit
  rejection. E2E covers the inline password rotation and admin self-action UI.
- The roster-enrollment E2E spec covers coach add in Admin → Users, forced
  rotation, the read-only email, the Back button, and password sign-in into the
  same workspace. The allowlist-management spec covers the row Actions dropdown,
  the one-credential requirement, the Domains sheet, and duplicate-add rejection.
- `bun run verify`, `bun run test:web`, `bun run e2e`, and `bun run e2e:security`
  pass.
