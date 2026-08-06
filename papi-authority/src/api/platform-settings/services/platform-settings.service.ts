import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
import type { UpdatePlatformSettingsDto } from '$/api/platform-settings/dto/platform-settings.dto';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';

export interface PlatformSettingsView {
  hasSsoTenantId: boolean;
  hasSsoClientId: boolean;
  updatedAt: Date;
}

/**
 * The platform-wide singleton, on the CONSOLE connection.
 *
 * Exactly one row exists and the guarantee is a database CHECK, not a rule in
 * this class (dossier 0.9 / D5) — so there is no create and no delete here,
 * only read and update. A second row would silently split the platform's
 * default Azure app registration, and the two halves would disagree about who
 * may sign in.
 */
@Injectable()
export class PlatformSettingsService {
  private static readonly SINGLETON_ID = 1;

  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<PlatformSettingsView> {
    return toView(
      await this.console.manager.findOneOrFail(PlatformSettingsEntity, {
        where: { id: PlatformSettingsService.SINGLETON_ID },
      }),
    );
  }

  async update(
    dto: UpdatePlatformSettingsDto,
    actorUserId: string | null,
  ): Promise<PlatformSettingsView> {
    return this.console.transaction(async (manager) => {
      const settings = await manager.findOneOrFail(PlatformSettingsEntity, {
        where: { id: PlatformSettingsService.SINGLETON_ID },
      });

      const before = {
        tenant: Boolean(settings.ssoTenantId),
        client: Boolean(settings.ssoClientId),
      };

      if (dto.ssoTenantId !== undefined) settings.ssoTenantId = dto.ssoTenantId;
      if (dto.ssoClientId !== undefined) settings.ssoClientId = dto.ssoClientId;

      await manager.save(settings);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.PlatformSettingsUpdated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'platform_settings',
        targetId: String(PlatformSettingsService.SINGLETON_ID),
        // Presence only. Repointing the platform's Azure tenant is among the
        // most consequential changes available here, so the FACT of it is
        // recorded — but the identifiers stay out of the trail, which is read
        // far more widely than it is written.
        metadata: {
          before,
          after: {
            tenant: Boolean(settings.ssoTenantId),
            client: Boolean(settings.ssoClientId),
          },
        },
      });

      return toView(settings);
    });
  }
}

function toView(settings: PlatformSettingsEntity): PlatformSettingsView {
  return {
    hasSsoTenantId: Boolean(settings.ssoTenantId),
    hasSsoClientId: Boolean(settings.ssoClientId),
    updatedAt: settings.updatedAt,
  };
}
