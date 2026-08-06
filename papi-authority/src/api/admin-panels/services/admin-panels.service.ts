import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import type {
  ConfigureAdminPanelAuthDto,
  CreateAdminPanelDto,
  UpdateAdminPanelDto,
} from '$/api/admin-panels/dto/admin-panel.dto';
import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditService } from '$/api/audit/services/audit.service';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import type { PaginatedResult, PaginationQueryDto } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { EntityManager } from 'typeorm';

export interface AdminPanelView {
  id: string;
  name: string;
  panelKey: string;
  isActive: boolean;
  theme: string;
  basicAuthEnabled: boolean;
  ssoAuthEnabled: boolean;
  /** Booleans, not the ids — see `toView`. */
  hasSsoTenantOverride: boolean;
  hasSsoClientOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Admin panels and their auth configuration, on the CONSOLE connection.
 *
 * The auth toggles here are load-bearing security settings, not preferences:
 * `basic_auth_enabled` is what makes an Azure-only panel refuse passwords, and
 * `sso_auth_enabled` is what makes a password-only panel refuse Azure tokens.
 * Both are read on every login, so a change takes effect immediately — there is
 * no cached copy anywhere.
 */
@Injectable()
export class AdminPanelsService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQueryDto): Promise<PaginatedResult<AdminPanelView>> {
    const { skip, take } = pageParams(query);

    const builder = this.console
      .getRepository(AdminPanelEntity)
      .createQueryBuilder('panel')
      .orderBy('panel.name', query.order ?? 'ASC')
      .skip(skip)
      .take(take);

    if (query.search) {
      builder.andWhere('(panel.name LIKE :search OR panel.panel_key LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [rows, total] = await builder.getManyAndCount();

    return paginated(rows.map(toView), total, query);
  }

  async findOne(id: string): Promise<AdminPanelView> {
    return toView(await this.loadOrFail(this.console.manager, id));
  }

  async create(dto: CreateAdminPanelDto, actorUserId: string | null): Promise<AdminPanelView> {
    return this.console.transaction(async (manager) => {
      if (await manager.findOne(AdminPanelEntity, { where: { panelKey: dto.panelKey } })) {
        throw new ConflictException('An admin panel with this key already exists.');
      }

      const panel = await manager.save(
        manager.create(AdminPanelEntity, {
          name: dto.name,
          panelKey: dto.panelKey,
          theme: dto.theme ?? 'default',
          // Inert by default, in every sense: inactive, and accepting NEITHER
          // credential type until an administrator says which one it takes.
          // A panel that defaulted to "password login on" would be reachable
          // the moment it was created.
          isActive: dto.isActive ?? false,
          basicAuthEnabled: false,
          ssoAuthEnabled: false,
        }),
      );

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.AdminPanelCreated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        adminPanelId: panel.id,
        targetType: 'admin_panel',
        targetId: panel.id,
        metadata: { name: panel.name, panelKey: panel.panelKey },
      });

      return toView(panel);
    });
  }

  async update(
    id: string,
    dto: UpdateAdminPanelDto,
    actorUserId: string | null,
  ): Promise<AdminPanelView> {
    return this.console.transaction(async (manager) => {
      const panel = await this.loadOrFail(manager, id);

      Object.assign(panel, {
        name: dto.name ?? panel.name,
        isActive: dto.isActive ?? panel.isActive,
        theme: dto.theme ?? panel.theme,
      });
      await manager.save(panel);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.AdminPanelUpdated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        adminPanelId: id,
        targetType: 'admin_panel',
        targetId: id,
        metadata: { fields: Object.keys(dto), isActive: panel.isActive },
      });

      return toView(panel);
    });
  }

  /**
   * The auth-mode switch. Separate permission (`adminPanels.configureAuth`)
   * from ordinary panel edits, because this decides how people authenticate.
   *
   * Refuses to leave a panel with NO enabled method while it is active: that
   * configuration locks every user out of a live panel with no error that
   * points at the cause. Turning the panel off is the supported way to close it.
   */
  async configureAuth(
    id: string,
    dto: ConfigureAdminPanelAuthDto,
    actorUserId: string | null,
  ): Promise<AdminPanelView> {
    return this.console.transaction(async (manager) => {
      const panel = await this.loadOrFail(manager, id);

      if (panel.isActive && !dto.basicAuthEnabled && !dto.ssoAuthEnabled) {
        throw new BadRequestException(
          'An active panel must allow at least one authentication method. Deactivate the panel instead.',
        );
      }

      const before = {
        basicAuthEnabled: panel.basicAuthEnabled,
        ssoAuthEnabled: panel.ssoAuthEnabled,
        ssoTenantId: panel.ssoTenantId,
        ssoClientId: panel.ssoClientId,
      };

      panel.basicAuthEnabled = dto.basicAuthEnabled;
      panel.ssoAuthEnabled = dto.ssoAuthEnabled;
      if (dto.ssoTenantId !== undefined) panel.ssoTenantId = dto.ssoTenantId;
      if (dto.ssoClientId !== undefined) panel.ssoClientId = dto.ssoClientId;

      await manager.save(panel);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.AdminPanelAuthConfigured,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        adminPanelId: id,
        targetType: 'admin_panel',
        targetId: id,
        // Before AND after: "who turned SSO off for rmp, and when" is the
        // question this trail exists to answer.
        metadata: {
          before: {
            ...before,
            ssoTenantId: Boolean(before.ssoTenantId),
            ssoClientId: Boolean(before.ssoClientId),
          },
          after: {
            basicAuthEnabled: panel.basicAuthEnabled,
            ssoAuthEnabled: panel.ssoAuthEnabled,
            ssoTenantId: Boolean(panel.ssoTenantId),
            ssoClientId: Boolean(panel.ssoClientId),
          },
        },
      });

      return toView(panel);
    });
  }

  async remove(id: string, actorUserId: string | null): Promise<void> {
    await this.console.transaction(async (manager) => {
      const panel = await this.loadOrFail(manager, id);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.AdminPanelDeleted,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        adminPanelId: id,
        targetType: 'admin_panel',
        targetId: id,
        metadata: { name: panel.name, panelKey: panel.panelKey },
      });

      await manager.softDelete(AdminPanelEntity, id);
    });
  }

  private async loadOrFail(manager: EntityManager, id: string): Promise<AdminPanelEntity> {
    const panel = await manager.findOne(AdminPanelEntity, { where: { id } });
    if (!panel) throw new NotFoundException('Admin panel not found.');
    return panel;
  }
}

/**
 * The SSO tenant and client ids are reported as BOOLEANS.
 *
 * They are not secrets — an Azure client id is public by design — but they are
 * infrastructure identifiers with no use in a management UI beyond "is an
 * override set here". Returning the values would put them in every browser
 * devtools log and every screenshot of the panel settings screen for no gain.
 */
function toView(panel: AdminPanelEntity): AdminPanelView {
  return {
    id: panel.id,
    name: panel.name,
    panelKey: panel.panelKey,
    isActive: panel.isActive,
    theme: panel.theme,
    basicAuthEnabled: panel.basicAuthEnabled,
    ssoAuthEnabled: panel.ssoAuthEnabled,
    hasSsoTenantOverride: Boolean(panel.ssoTenantId),
    hasSsoClientOverride: Boolean(panel.ssoClientId),
    createdAt: panel.createdAt,
    updatedAt: panel.updatedAt,
  };
}
