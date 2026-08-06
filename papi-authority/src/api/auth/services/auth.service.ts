import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditService } from '$/api/audit/services/audit.service';
import type { LoginDto } from '$/api/auth/dto/login.dto';
import { LockoutService } from '$/api/auth/services/lockout.service';
import {
  RefreshTokenReuseError,
  RefreshTokenService,
} from '$/api/auth/services/refresh-token.service';
import { PermissionResolverService } from '$/api/authorization/services/permission-resolver.service';
import { UserEntity } from '$/api/users/entities/user.entity';
import { authConfig } from '$/configs/index.configs';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import type {
  AccessTokenClaims,
  ProjectPermissionSet,
} from '$/constants/interfaces/token-claims.interface';
import { PasswordHasherService } from '$/core/crypto/password-hasher.service';
import { TokenSignerService } from '$/core/crypto/token-signer.service';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Set when a temporary password must be changed before proceeding (0.22). */
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity, DataSourceName.Authority)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(AdminPanelEntity, DataSourceName.Authority)
    private readonly panels: Repository<AdminPanelEntity>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenSigner: TokenSignerService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly lockouts: LockoutService,
    private readonly audit: AuditService,
    private readonly permissionResolver: PermissionResolverService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /**
   * Password login.
   *
   * Every credential failure returns the SAME generic 401 with no detail about
   * which check failed — unknown user, wrong password, inactive account and
   * missing panel grant are indistinguishable to the caller. Anything else
   * turns this endpoint into a user-enumeration oracle.
   */
  async login(dto: LoginDto, context: RequestContext): Promise<AuthResult> {
    const panel = await this.panels.findOne({ where: { panelKey: dto.panelKey, isActive: true } });

    if (!panel) {
      await this.audit.record({
        eventType: AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Failure,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'unknown_panel', panelKey: dto.panelKey },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    // A panel running Azure-only auth has no password to check (0.5 / 0.22).
    if (!panel.basicAuthEnabled) {
      await this.audit.record({
        eventType: AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Denied,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'password_auth_disabled_for_panel' },
      });
      throw new ForbiddenException('Password authentication is disabled for this panel.');
    }

    const user = await this.findByLogin(dto.username);

    if (!user) {
      await this.audit.record({
        eventType: AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Failure,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'unknown_user' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    const lockedForMs = await this.lockouts.check(user.id);
    if (lockedForMs > 0) {
      await this.audit.record({
        eventType: AuthEventType.LoginLockedOut,
        outcome: AuthEventOutcome.Denied,
        actorUserId: user.id,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { lockedForMs },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    // An SSO-only account has no password. Still run a verification against a
    // dummy hash so the response time does not distinguish it from a real
    // account with a wrong password.
    const passwordMatches = user.password
      ? await this.passwordHasher.verify(dto.password, user.password)
      : await this.consumeTimingBudget(dto.password);

    if (!passwordMatches) {
      const { locked, failureCount } = await this.lockouts.recordFailure(user.id);
      await this.audit.record({
        eventType: locked ? AuthEventType.LoginLockedOut : AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Failure,
        actorUserId: user.id,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { failureCount, locked },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      await this.audit.record({
        eventType: AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Denied,
        actorUserId: user.id,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'inactive_user' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.adminPanels.some((granted) => granted.id === panel.id)) {
      await this.audit.record({
        eventType: AuthEventType.LoginFailed,
        outcome: AuthEventOutcome.Denied,
        actorUserId: user.id,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'no_panel_grant' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.lockouts.clear(user.id);

    const result = await this.issueFor(user, panel.panelKey, context);

    await this.audit.record({
      eventType: AuthEventType.LoginSucceeded,
      outcome: AuthEventOutcome.Success,
      actorUserId: user.id,
      adminPanelId: panel.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { mustChangePassword: result.mustChangePassword },
    });

    return result;
  }

  /**
   * Rotates a refresh token and re-reads live permissions, which is where a
   * changed role or revoked project takes effect (dossier Part I).
   */
  async refresh(
    presentedToken: string,
    panelKey: string,
    context: RequestContext,
  ): Promise<AuthResult> {
    let rotated;
    try {
      rotated = await this.refreshTokens.rotate(presentedToken, context);
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        // The whole family is already revoked by the time we get here.
        //
        // TWO events, deliberately: the detection and the revocation are
        // separate facts. An auditor filtering for `token.family_revoked`
        // must see every family kill regardless of what caused it — reuse,
        // logout, or an administrator — and one filtered query should not
        // require knowing all three causes.
        await this.audit.record({
          eventType: AuthEventType.TokenReuseDetected,
          outcome: AuthEventOutcome.Denied,
          actorUserId: error.userId,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: { familyId: error.familyId, action: 'family_revoked' },
        });

        await this.audit.record({
          eventType: AuthEventType.TokenFamilyRevoked,
          outcome: AuthEventOutcome.Success,
          actorUserId: error.userId,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: {
            familyId: error.familyId,
            reason: 'reuse_detected',
            sessionsRevoked: error.sessionsRevoked,
          },
        });
      }
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const user = await this.findActiveById(rotated.userId);
    if (!user) {
      await this.refreshTokens.revokeAllForUser(rotated.userId, 'user_unavailable');
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const accessToken = await this.signAccessToken(user, panelKey);

    await this.audit.record({
      eventType: AuthEventType.TokenRefreshed,
      outcome: AuthEventOutcome.Success,
      actorUserId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      accessToken,
      refreshToken: rotated.issued.token,
      expiresIn: this.config.accessTokenTtlSeconds,
      mustChangePassword: user.isSpReset,
    };
  }

  /** Revokes the whole family, so every rotation descended from that login dies. */
  async logout(presentedToken: string, context: RequestContext): Promise<void> {
    const stored = await this.refreshTokens.findFamilyByToken(presentedToken);
    if (!stored) return;

    const revoked = await this.refreshTokens.revokeFamily(stored.familyId, 'logout');

    await this.audit.record({
      eventType: AuthEventType.LoggedOut,
      outcome: AuthEventOutcome.Success,
      actorUserId: stored.userId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { familyId: stored.familyId, sessionsRevoked: revoked },
    });

    await this.audit.record({
      eventType: AuthEventType.TokenFamilyRevoked,
      outcome: AuthEventOutcome.Success,
      actorUserId: stored.userId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { familyId: stored.familyId, reason: 'logout', sessionsRevoked: revoked },
    });
  }

  /**
   * Issues a session for an already-verified SSO identity.
   *
   * Password verification, lockout and the panel's password-mode gate all live
   * in `login()`; the SSO flow performs its own equivalent checks (Azure
   * signature, panel SSO enabled, panel grant) before calling this, so this
   * only mints the tokens.
   */
  issueForSso(user: UserEntity, panelKey: string, context: RequestContext): Promise<AuthResult> {
    return this.issueFor(user, panelKey, context);
  }

  private async issueFor(
    user: UserEntity,
    panelKey: string,
    context: RequestContext,
  ): Promise<AuthResult> {
    const accessToken = await this.signAccessToken(user, panelKey);
    const refresh = await this.refreshTokens.issue(user.id, context);

    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.config.accessTokenTtlSeconds,
      mustChangePassword: user.isSpReset,
    };
  }

  private async signAccessToken(user: UserEntity, panelKey: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const claims: AccessTokenClaims = {
      sub: user.id,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
      panel: panelKey,
      projects: await this.resolveProjects(user),
      platform: await this.permissionResolver.resolvePlatform(user.roleId),
      epoch: user.tokenEpoch,
      jti: randomUUID(),
      iat: now,
      exp: now + this.config.accessTokenTtlSeconds,
    };

    return this.tokenSigner.sign(claims);
  }

  /**
   * The real 4-layer resolution (dossier F.5 / 0.39), replacing the Phase 4
   * stub. Project entitlements and per-user overrides are now enforced in the
   * token, so a permission the role grants but the project is not licensed for
   * no longer appears.
   */
  private resolveProjects(user: UserEntity): Promise<Record<string, ProjectPermissionSet>> {
    return this.permissionResolver.resolve({
      userId: user.id,
      roleId: user.roleId,
      projectIds: user.projects.map((project) => project.id),
    });
  }

  /** Case-insensitive by collation (utf8mb4_0900_ai_ci); soft-deleted excluded. */
  private findByLogin(login: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.projects', 'project')
      .leftJoinAndSelect('user.adminPanels', 'adminPanel')
      .where('user.username = :login OR user.email = :login', { login })
      .getOne();
  }

  private findActiveById(userId: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.projects', 'project')
      .leftJoinAndSelect('user.adminPanels', 'adminPanel')
      .where('user.id = :userId', { userId })
      .andWhere('user.is_active = TRUE')
      .getOne();
  }

  /**
   * Burns roughly one argon2 verification so that "no password set" and "wrong
   * password" take comparable time. Without this, response latency reveals
   * which accounts are SSO-only.
   */
  private async consumeTimingBudget(password: string): Promise<false> {
    await this.passwordHasher.verify(password, DUMMY_HASH);
    return false;
  }
}

/**
 * A real argon2id hash of an unguessable value, used only to spend the same CPU
 * as a genuine verification.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1kdW1teS1zYWx0$c29tZS1kdW1teS12YWx1ZS1ub3QtYS1yZWFsLXRhZw';
