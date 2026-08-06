import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, Repository } from 'typeorm';

import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';

import type { EntityManager } from 'typeorm';

/**
 * Cuts a user's live sessions, from the CONSOLE connection.
 *
 * Two effects, both required:
 *  - every un-revoked refresh token for the user is soft-revoked, so no further
 *    rotation is possible and the next `/auth/refresh` fails;
 *  - `token_epoch` is bumped, which is the marker a future near-instant
 *    revocation path will compare against (dossier B.8).
 *
 * Revocation is SOFT — `revoked_at`, never DELETE. Reuse-detection needs the
 * revoked row to survive, or a replayed token looks merely unknown instead of
 * killing its family. This is also why the console holds
 * `UPDATE (revoked_at, revoked_reason)` and no INSERT here: it can end a
 * session but never mint one.
 *
 * An access token already issued still lives out its TTL — that is the
 * documented revocation ceiling (Part I). This closes the refresh path, which
 * is what bounds the window to one access-token lifetime instead of one refresh
 * lifetime.
 */
@Injectable()
export class SessionRevocationService {
  constructor(
    @InjectRepository(RefreshTokenEntity, DataSourceName.Console)
    private readonly tokens: Repository<RefreshTokenEntity>,
    @InjectRepository(UserEntity, DataSourceName.Console)
    private readonly users: Repository<UserEntity>,
  ) {}

  /**
   * @param manager pass the transaction manager when this must be atomic with
   *   the change that triggered it (a role swap, a deactivation).
   * @returns how many token rows were revoked — audit metadata, and a useful
   *   signal that an account really was in active use.
   */
  async revokeAllForUser(userId: string, reason: string, manager?: EntityManager): Promise<number> {
    const tokens = manager ? manager.getRepository(RefreshTokenEntity) : this.tokens;
    const users = manager ? manager.getRepository(UserEntity) : this.users;

    const result = await tokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );

    await users.increment({ id: userId }, 'tokenEpoch', 1);

    return result.affected ?? 0;
  }
}
