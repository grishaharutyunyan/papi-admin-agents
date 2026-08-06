import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { LoginLockoutEntity } from '$/api/auth/entities/login-lockout.entity';
import { authConfig } from '$/configs/index.configs';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Password-failure lockout (dossier 0.10).
 *
 * Lives in auth-runtime, not on `users`. That placement is what allows the
 * authority principal to hold **zero write access** to the identity table: the
 * auth engine has to record failures during a login, and if that counter lived
 * on `users` it would need write access there — collapsing the whole
 * "authority can never alter identity" property (0.20/0.23).
 */
@Injectable()
export class LockoutService {
  constructor(
    @InjectRepository(LoginLockoutEntity, DataSourceName.Authority)
    private readonly lockouts: Repository<LoginLockoutEntity>,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /** Remaining lock in ms, or 0 when the account is usable. */
  async check(userId: string): Promise<number> {
    const state = await this.lockouts.findOne({ where: { userId } });
    if (!state?.lockedUntil) return 0;

    const remaining = state.lockedUntil.getTime() - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Records a failure and locks the account once the threshold is reached
   * within the window.
   *
   * Failures older than the window do not count: the counter restarts rather
   * than accumulating forever, so an occasional typo months apart never locks
   * a legitimate user out.
   */
  async recordFailure(userId: string): Promise<{ locked: boolean; failureCount: number }> {
    const { maxFailures, windowMinutes, durationMinutes } = this.config.lockout;
    const now = new Date();

    const state = await this.lockouts.findOne({ where: { userId } });
    const withinWindow =
      state?.lastFailureAt != null &&
      now.getTime() - state.lastFailureAt.getTime() <= windowMinutes * 60_000;

    const failureCount = withinWindow ? state.failureCount + 1 : 1;
    const locked = failureCount >= maxFailures;
    const lockedUntil = locked ? new Date(now.getTime() + durationMinutes * 60_000) : null;

    await this.lockouts.upsert({ userId, failureCount, lastFailureAt: now, lockedUntil }, [
      'userId',
    ]);

    return { locked, failureCount };
  }

  /** Clears state after a successful authentication. */
  async clear(userId: string): Promise<void> {
    await this.lockouts.delete({ userId });
  }
}
