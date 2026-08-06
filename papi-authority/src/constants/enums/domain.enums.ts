/** rmp-verified members and values (reference: rmp `constants/enums/project.enums.ts`). */
export enum RequiredLevel {
  None = 'NONE',
  Optional = 'OPTIONAL',
  Required = 'REQUIRED',
}

export enum OperatorType {
  In = 'IN',
  Out = 'OUT',
}

/**
 * A permission targets either a page (UI surface) or an api (endpoint), so an
 * override can hide a page and block an endpoint independently (dossier F.5).
 */
export enum PermissionKind {
  Page = 'page',
  Api = 'api',
}

/**
 * L4 semantics. `Deny` subtracts from what L2 ∩ L3 already allows; `Grant` is
 * the narrow "grant within the project's ceiling" case.
 *
 * NOTE this is a deliberate departure from the forks. There, a role REPLACES a
 * user's own permissions entirely — `user.role?.id ? role.permissions : meta.permissions`
 * — so per-user data is dead whenever a role is attached (verified, dossier
 * D.3c). Here L4 composes with the role instead of shadowing it.
 */
export enum OverrideEffect {
  Deny = 'deny',
  Grant = 'grant',
}

/**
 * Onboarding lifecycle (dossier 0.8, amended by 0.24).
 *
 * There is deliberately no `Approved` member: approval creates the `users` row
 * and grants in one transaction and then DELETES the invitation, so no approved
 * row ever survives. The audit record written before the delete is what proves
 * the onboarding happened.
 *
 * Also note there is no password path here — invitations are Azure/SSO only
 * (0.18). Password-mode users are created directly by an access-control admin.
 */
export enum InvitationStatus {
  Created = 'created',
  Sent = 'sent',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Expired = 'expired',
}

export enum AuthEventOutcome {
  Success = 'success',
  Failure = 'failure',
  Denied = 'denied',
}

/**
 * Known audit event types. The COLUMN is a varchar, not an enum: a new event
 * type must never require a schema migration on an append-only table that will
 * hold tens of millions of rows.
 */
export enum AuthEventType {
  LoginSucceeded = 'login.succeeded',
  LoginFailed = 'login.failed',
  LoginLockedOut = 'login.locked_out',
  TwoFactorSucceeded = 'two_factor.succeeded',
  TwoFactorFailed = 'two_factor.failed',
  TokenRefreshed = 'token.refreshed',
  TokenReuseDetected = 'token.reuse_detected',
  TokenFamilyRevoked = 'token.family_revoked',
  LoggedOut = 'session.logged_out',
  PasswordChanged = 'password.changed',
  SsoLoginSucceeded = 'sso.login_succeeded',
  SsoLoginRejected = 'sso.login_rejected',
  InvitationCreated = 'invitation.created',
  InvitationSent = 'invitation.sent',
  InvitationAccepted = 'invitation.accepted',
  InvitationApproved = 'invitation.approved',
  InvitationRejected = 'invitation.rejected',
  UserCreated = 'user.created',
  UserUnauthorized = 'user.unauthorized',
  UserUpdated = 'user.updated',
  UserDeleted = 'user.deleted',
  UserActivated = 'user.activated',
  UserDeactivated = 'user.deactivated',
  UserRoleChanged = 'user.role_changed',
  UserGrantsChanged = 'user.grants_changed',
  UserProfileUpdated = 'user.profile_updated',
  TempPasswordIssued = 'user.temp_password_issued',
  RoleCreated = 'role.created',
  RoleUpdated = 'role.updated',
  RoleDeleted = 'role.deleted',
  RolePermissionsChanged = 'role.permissions_changed',
  ProjectCreated = 'project.created',
  ProjectUpdated = 'project.updated',
  ProjectDeleted = 'project.deleted',
  AdminPanelCreated = 'admin_panel.created',
  AdminPanelUpdated = 'admin_panel.updated',
  AdminPanelDeleted = 'admin_panel.deleted',
  AdminPanelAuthConfigured = 'admin_panel.auth_configured',
  EntitlementsChanged = 'entitlements.changed',
  OverridesChanged = 'overrides.changed',
  PlatformSettingsUpdated = 'platform_settings.updated',
}
