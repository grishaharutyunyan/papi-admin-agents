import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
import type { RequestContext } from '$/api/auth/services/auth.service';
import { RefreshTokenService } from '$/api/auth/services/refresh-token.service';
import type { ChangeMyPasswordDto, UpdateMeDto } from '$/api/users/dto/me.dto';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import { PasswordHasherService } from '$/core/crypto/password-hasher.service';

export interface MeView {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  language: string;
  timezone: string | null;
  mustChangePassword: boolean;
  roleId: string | null;
  roleName: string | null;
}

/**
 * Self-service, on the AUTHORITY connection (dossier 0.45).
 *
 * The admin panels do not write identity tables themselves: rmp and the rest
 * proxy a user's own profile and password changes here (the 0.10 amendment).
 * That keeps every write to `users` inside this service and behind one of two
 * DB principals.
 *
 * This path runs under `papi_authority`, whose entire write authority over
 * identity is a column-level UPDATE on the profile and password fields. A
 * defect here — a missing ownership check, a mis-parsed id — cannot change a
 * role, a project grant, or `is_active`, because the grant does not permit it.
 * The security boundary is the grant; this class works within it.
 */
@Injectable()
export class MeService {
  constructor(
    @InjectRepository(UserEntity, DataSourceName.Authority)
    private readonly users: Repository<UserEntity>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async findMe(userId: string): Promise<MeView> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { role: true } });
    if (!user) throw new NotFoundException('User not found.');

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      language: user.language,
      timezone: user.timezone,
      mustChangePassword: user.isSpReset,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
    };
  }

  /**
   * Profile only. Sessions are untouched (0.46) — logging someone out for
   * correcting their own phone number teaches people not to keep it correct.
   */
  async updateMe(userId: string, dto: UpdateMeDto, context: RequestContext): Promise<MeView> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    // Targeted update over the granted columns only. `save()` on the entity
    // would be equivalent today, but an UPDATE naming its columns explicitly
    // stays honest if a future column is added to this entity.
    await this.users.update(userId, {
      firstName: dto.firstName ?? user.firstName,
      lastName: dto.lastName ?? user.lastName,
      phone: dto.phone ?? user.phone,
      language: dto.language ?? user.language,
      timezone: dto.timezone ?? user.timezone,
    });

    await this.audit.record({
      eventType: AuthEventType.UserProfileUpdated,
      outcome: AuthEventOutcome.Success,
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { fields: Object.keys(dto) },
    });

    return this.findMe(userId);
  }

  /**
   * Password change. Requires the current password — always, including when
   * `is_sp_reset` is set, because a temporary password is still a password the
   * user must present.
   *
   * Every OTHER session is revoked afterwards: the usual reason someone changes
   * a password is that they believe it is known to someone else, and leaving
   * the attacker's session alive defeats the point. The caller's own session
   * survives so they are not logged out of the act of securing their account.
   */
  async changeMyPassword(
    userId: string,
    dto: ChangeMyPasswordDto,
    context: RequestContext,
    currentRefreshToken?: string,
  ): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .andWhere('user.is_active = TRUE')
      .getOne();

    if (!user) throw new NotFoundException('User not found.');

    // An SSO-only account has no password to change. Azure owns that
    // credential; offering a change here would imply otherwise.
    if (!user.password) {
      throw new BadRequestException(
        'This account signs in with Microsoft and has no password to change.',
      );
    }

    if (!(await this.passwordHasher.verify(dto.currentPassword, user.password))) {
      await this.audit.record({
        eventType: AuthEventType.PasswordChanged,
        outcome: AuthEventOutcome.Failure,
        actorUserId: userId,
        targetType: 'user',
        targetId: userId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'current_password_mismatch' },
      });
      throw new BadRequestException('The current password is incorrect.');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('The new password must differ from the current one.');
    }

    await this.users.update(userId, {
      password: await this.passwordHasher.hash(dto.newPassword),
      isSpReset: false,
      spUpdatedAt: new Date(),
    });

    const revoked = await this.refreshTokens.revokeAllForUser(
      userId,
      'password_changed',
      currentRefreshToken,
    );

    await this.audit.record({
      eventType: AuthEventType.PasswordChanged,
      outcome: AuthEventOutcome.Success,
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { otherSessionsRevoked: revoked },
    });
  }
}
