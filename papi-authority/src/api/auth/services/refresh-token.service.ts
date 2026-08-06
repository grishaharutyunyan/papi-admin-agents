import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, Repository } from 'typeorm';

import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { authConfig } from '$/configs/index.configs';
import { DataSourceName } from '$/constants/enums/config.enums';

/** 384 bits of entropy — guessing is not a threat model, replay is. */
const TOKEN_BYTES = 48;

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: Date;
}

export class RefreshTokenReuseError extends Error {
  constructor(
    readonly familyId: string,
    readonly userId: string,
    /** How many live sessions the detection killed — audit metadata. */
    readonly sessionsRevoked: number,
  ) {
    super('Refresh token reuse detected.');
  }
}

export class RefreshTokenInvalidError extends Error {}

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshTokenEntity, DataSourceName.Authority)
    private readonly tokens: Repository<RefreshTokenEntity>,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /** Issues a token, starting a new family unless one is continued. */
  async issue(
    userId: string,
    context: { ip?: string | null; userAgent?: string | null; familyId?: string },
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const familyId = context.familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);

    await this.tokens.insert({
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    return { token, familyId, expiresAt };
  }

  /**
   * Rotation with family reuse-detection (dossier B.7).
   *
   * A refresh token is single-use. Presenting one that has already been rotated
   * means either the legitimate holder replayed it or an attacker stole it —
   * indistinguishable, so we assume the worst and revoke the ENTIRE family,
   * logging every session descended from that login out at once.
   *
   * This is why revocation is soft (`revoked_at`) and rows are never deleted:
   * a deleted row makes a replayed token look merely unknown, and the attack
   * goes undetected.
   */
  async rotate(
    presentedToken: string,
    context: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ issued: IssuedRefreshToken; userId: string }> {
    const stored = await this.tokens.findOne({ where: { tokenHash: hashToken(presentedToken) } });

    if (!stored) throw new RefreshTokenInvalidError('Unknown refresh token.');

    if (stored.revokedAt !== null) {
      const killed = await this.revokeFamily(stored.familyId, 'reuse_detected');
      throw new RefreshTokenReuseError(stored.familyId, stored.userId, killed);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new RefreshTokenInvalidError('Refresh token expired.');
    }

    await this.tokens.update(
      { id: stored.id },
      { revokedAt: new Date(), revokedReason: 'rotated' },
    );

    const issued = await this.issue(stored.userId, { ...context, familyId: stored.familyId });
    return { issued, userId: stored.userId };
  }

  /**
   * Revokes every live token in a family. Used by logout and reuse-detection.
   *
   * @returns how many rows were revoked, so the caller can audit the size of
   *   the blast radius — "reuse detected, 4 sessions killed" is a materially
   *   different event from "reuse detected, 1 session killed".
   */
  async revokeFamily(familyId: string, reason: string): Promise<number> {
    const result = await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );

    return result.affected ?? 0;
  }

  /**
   * Revokes every live session for a user, optionally sparing the caller's own.
   *
   * `exceptToken` exists for the self-service password change (0.45): the point
   * of that revocation is to evict whoever else may hold the old credential, so
   * logging the user out of the very request in which they secured their
   * account would be user-hostile without adding any protection.
   *
   * @returns how many token rows were revoked.
   */
  async revokeAllForUser(userId: string, reason: string, exceptToken?: string): Promise<number> {
    const builder = this.tokens
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL');

    if (exceptToken) {
      builder.andWhere('token_hash != :spared', { spared: hashToken(exceptToken) });
    }

    const result = await builder.execute();

    return typeof result.affected === 'number' ? result.affected : 0;
  }

  async findFamilyByToken(presentedToken: string): Promise<RefreshTokenEntity | null> {
    return this.tokens.findOne({ where: { tokenHash: hashToken(presentedToken) } });
  }
}

/**
 * Only the SHA-256 is ever stored. A plain digest is sufficient — and correct —
 * because the input is 384 bits of uniform randomness, so there is no
 * dictionary to attack and no need for a slow KDF.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
