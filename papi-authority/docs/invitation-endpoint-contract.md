# Invitation / join page — endpoint contract

The join page is a **separate front-end on its own subdomain**, authored later
(dossier 0.19). papi-authority ships only the API. This document is the contract
that front-end is built against.

Because the page is cross-origin to this API, its origin **must** be set in
`INVITATION_ORIGIN`, which is added to the CORS allow-list automatically.

The invitation pipeline is **Azure/SSO only** (dossier 0.18). There is no
"set your password" path — password-mode users are created directly by an
access-control admin.

---

## 1. Validate the token — on page load

```http
GET /api/invitations/:token
```

`:token` is the value from the emailed link. Public, rate-limited with the tight
`auth` bucket.

**200**
```json
{ "email": "newhire@nrg.local", "expiresAt": "2026-08-09T11:18:57.816Z" }
```

**404** — unknown, already used, rejected, or expired. These are deliberately
indistinguishable: reporting "expired" rather than "unknown" would confirm that
a given token once existed. Show a single "this invitation link is no longer
valid" state.

Only the invited email is returned. Do not expect roles, projects or panels —
those are pre-assigned server-side and applied at approval.

## 2. Accept — after the user signs in with Microsoft

Acquire an Azure token in the browser (SPA auth-code + PKCE; see the Azure setup
checklist below), then:

```http
POST /api/invitations/:token/accept
Content-Type: application/json

{ "azureToken": "<the id/access token from Azure>", "panelKey": "RMP" }
```

**200**
```json
{ "status": "accepted" }
```

**401** — the Azure token failed verification.
**403** — the signed-in Azure account is not the invited email, or the panel has
SSO disabled.
**404** — the invitation is no longer open.

### What acceptance does and does not do

It records the proven Azure `oid` and profile **on the invitation** and marks it
`accepted`. It does **not** create a user and does **not** grant access
(dossier 0.8). The correct UI is "thanks — your request is awaiting approval",
never "welcome, you're in".

Access begins only when an administrator approves in access-control, which
creates the `users` row and applies the pre-assigned grants in one transaction.

## 3. Creating an invitation (administrators, not the join page)

```http
POST /api/invitations
Authorization: Bearer <papi-authority access token>
Content-Type: application/json

{ "email": "newhire@nrg.local", "roleId": "…", "projectIds": ["…"], "adminPanelIds": ["…"] }
```

Requires the **platform-scoped** `users.invite` permission (dossier 0.43) — no
`x-project-id`, since inviting someone belongs to no tenant.

The response contains `id`, `email` and `expiresAt`. In **local/test with
`MAIL_ENABLED=0` only**, it also contains `token` so the flow is testable
(dossier 0.42); a prod-like environment cannot start with mail disabled, so that
field can never appear in a real deployment.

---

## Azure setup checklist (dossier 0.9)

To be applied when real Azure values exist. The platform uses **one** app
registration — all panel domains *and* the join page are redirect URIs on it.

- **Single-tenant.**
- **"User assignment required" = Yes.** This is the Azure administrator's one
  platform-wide kill switch, assigned once per person.
- **SPA platform, authorization code + PKCE only.** Implicit grant disabled. No
  client secret in any front-end.
- **Exact-match HTTPS redirect URIs**, no wildcards — every panel domain plus
  the join page subdomain.
- **One Conditional Access policy (MFA)**, applied uniformly to all panels.
- papi-authority validates `iss`, `tid`, `aud`, signature and `exp`, and matches
  `oid` + email.

Per-panel `sso_tenant_id` / `sso_client_id` are **nullable overrides** on
`admin_panels`; `NULL` means "use the platform default" from the single-row
`platform_settings`. They exist only as the escape hatch if one panel ever needs
its own tenant.

The Azure token is **identity proof only**. It conveys no authorization: what a
person may do comes entirely from papi-authority's own model, so a valid token
for an unknown or unapproved person grants nothing.
