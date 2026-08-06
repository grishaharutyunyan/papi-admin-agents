import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuthAuditEventEntity } from '$/api/audit/entities/auth-audit-event.entity';
import { LoginLockoutEntity } from '$/api/auth/entities/login-lockout.entity';
import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { TwoFactorStateEntity } from '$/api/auth/entities/two-factor-state.entity';
import { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { UserProjectPermissionEntity } from '$/api/authorization/entities/user-project-permission.entity';
import { InvitationEntity } from '$/api/invitations/entities/invitation.entity';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { ProjectBlockerEntity } from '$/api/projects/entities/project-blocker.entity';
import { ProjectLimitEntity } from '$/api/projects/entities/project-limit.entity';
import { ProjectOperatorOpTypeEntity } from '$/api/projects/entities/project-operator-op-type.entity';
import { ProjectOperatorEntity } from '$/api/projects/entities/project-operator.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { UserEntity } from '$/api/users/entities/user.entity';

/**
 * Identity tables — the console DB principal has full CRUD; the authority
 * principal has SELECT plus the narrow column-level UPDATE of dossier 0.23.
 *
 * These are mapped on BOTH runtime connections deliberately (Q5A): the DB
 * grant, not the entity mapping, is what makes them read-only for the authority
 * principal. Enforcement lives in the database, where no code path can bypass
 * it.
 *
 * Auth-runtime entities are added in the second half of Phase 2.
 */
export const IDENTITY_ENTITIES = [
  UserEntity,
  UserRoleEntity,
  ProjectEntity,
  ProjectLimitEntity,
  ProjectOperatorEntity,
  ProjectOperatorOpTypeEntity,
  ProjectBlockerEntity,
  AdminPanelEntity,
  PlatformSettingsEntity,
  PermissionCatalogEntity,
  RolePermissionEntity,
  ProjectEntitlementEntity,
  UserProjectPermissionEntity,
];

/**
 * Auth-runtime tables — the authority principal has full CRUD; the console
 * principal has only the operation-scoped grants of dossier 0.25
 * (SELECT+DELETE on invitations, UPDATE(revoked_at) on refresh_tokens, DELETE
 * on two_factor_state and login_lockouts, SELECT on auth_audit_events).
 *
 * That grant set is what keeps B.3's property intact: a fully compromised
 * access-control cannot forge a session, plant a 2FA secret, or tamper with the
 * audit trail.
 */
export const AUTH_RUNTIME_ENTITIES = [
  RefreshTokenEntity,
  InvitationEntity,
  AuthAuditEventEntity,
  LoginLockoutEntity,
  TwoFactorStateEntity,
];

/** Everything the service maps today. */
export const ALL_ENTITIES = [...IDENTITY_ENTITIES, ...AUTH_RUNTIME_ENTITIES];
