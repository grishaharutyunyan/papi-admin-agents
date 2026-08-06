import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
import type {
  CreateProjectDto,
  ProjectQueryDto,
  SetProjectBlockersDto,
  UpdateProjectDto,
  UpsertOperatorOpTypeDto,
  UpsertProjectLimitDto,
  UpsertProjectOperatorDto,
} from '$/api/projects/dto/project.dto';
import { ProjectBlockerEntity } from '$/api/projects/entities/project-blocker.entity';
import { ProjectLimitEntity } from '$/api/projects/entities/project-limit.entity';
import { ProjectOperatorOpTypeEntity } from '$/api/projects/entities/project-operator-op-type.entity';
import { ProjectOperatorEntity } from '$/api/projects/entities/project-operator.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import type { PaginatedResult } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { EntityManager } from 'typeorm';

/**
 * Projects — the tenants of the platform, on the CONSOLE connection.
 *
 * A project is L1: membership in one is the precondition for every
 * project-scoped permission check, and `project_entitlements` (L2) caps what
 * any role can grant within it. Deactivating a project therefore has a wide
 * blast radius, which is why `is_active` changes are audited like a grant
 * change rather than an ordinary edit.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProjectQueryDto): Promise<PaginatedResult<ProjectEntity>> {
    const { skip, take } = pageParams(query);

    const builder = this.console
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .orderBy('project.name', query.order ?? 'ASC')
      .skip(skip)
      .take(take);

    if (query.search) {
      builder.andWhere('(project.name LIKE :search OR project.project LIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.isActive !== undefined) {
      builder.andWhere('project.is_active = :isActive', { isActive: query.isActive });
    }

    const [items, total] = await builder.getManyAndCount();

    return paginated(items, total, query);
  }

  /** Full detail including every nested resource — the project edit screen. */
  async findOne(id: string): Promise<ProjectEntity> {
    return this.loadOrFail(this.console.manager, id, true);
  }

  async create(dto: CreateProjectDto, actorUserId: string | null): Promise<ProjectEntity> {
    return this.console.transaction(async (manager) => {
      await this.assertIdentifiersFree(manager, dto.project, dto.projectDb);

      const project = await manager.save(
        manager.create(ProjectEntity, {
          ...dto,
          projectTz: dto.projectTz ?? null,
          logoUrl: dto.logoUrl ?? null,
          appTypes: dto.appTypes ?? null,
          additionalTrxTypes: dto.additionalTrxTypes ?? null,
          projectPhoneCountryCode: dto.projectPhoneCountryCode ?? null,
          isActive: dto.isActive ?? false,
        }),
      );

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.ProjectCreated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'project',
        targetId: project.id,
        metadata: { name: project.name, project: project.project },
      });

      return this.loadOrFail(manager, project.id, true);
    });
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    actorUserId: string | null,
  ): Promise<ProjectEntity> {
    return this.console.transaction(async (manager) => {
      const project = await this.loadOrFail(manager, id, false);
      const wasActive = project.isActive;

      Object.assign(project, stripUndefined(dto));
      await manager.save(project);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.ProjectUpdated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'project',
        targetId: id,
        metadata: {
          fields: Object.keys(dto),
          // Called out explicitly: deactivating a project removes the L1 gate
          // for every member at once, which is a very different event from a
          // renamed logo URL and should be greppable as such.
          activationChanged: dto.isActive !== undefined && dto.isActive !== wasActive,
          isActive: project.isActive,
        },
      });

      return this.loadOrFail(manager, id, true);
    });
  }

  /** Soft delete (0.47) — audit rows and historical grants keep resolving. */
  async remove(id: string, actorUserId: string | null): Promise<void> {
    await this.console.transaction(async (manager) => {
      const project = await this.loadOrFail(manager, id, false);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.ProjectDeleted,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'project',
        targetId: id,
        metadata: { name: project.name, project: project.project },
      });

      await manager.softDelete(ProjectEntity, id);
    });
  }

  /* ----------------------------------------------------------- limits ---- */

  /** Keyed by (project, currency) — one limit set per currency, upserted. */
  async upsertLimit(
    projectId: string,
    dto: UpsertProjectLimitDto,
    actorUserId: string | null,
  ): Promise<ProjectLimitEntity> {
    return this.console.transaction(async (manager) => {
      await this.loadOrFail(manager, projectId, false);

      const existing = await manager.findOne(ProjectLimitEntity, {
        where: { projectId, currency: dto.currency },
      });

      const limit = await manager.save(
        existing
          ? Object.assign(existing, stripUndefined(dto))
          : manager.create(ProjectLimitEntity, { projectId, ...dto }),
      );

      await this.auditNested(manager, actorUserId, projectId, 'limit', {
        currency: dto.currency,
        created: !existing,
      });

      return limit;
    });
  }

  async removeLimit(projectId: string, limitId: string, actorUserId: string | null): Promise<void> {
    await this.console.transaction(async (manager) => {
      const limit = await manager.findOne(ProjectLimitEntity, {
        where: { id: limitId, projectId },
      });
      if (!limit) throw new NotFoundException('Limit not found for this project.');

      await this.auditNested(manager, actorUserId, projectId, 'limit_removed', {
        currency: limit.currency,
      });

      // Hard delete: a limit row is configuration, not identity. Nothing in the
      // audit trail references it (0.47 applies to identity tables).
      await manager.delete(ProjectLimitEntity, { id: limitId });
    });
  }

  /* -------------------------------------------------------- operators ---- */

  async upsertOperator(
    projectId: string,
    dto: UpsertProjectOperatorDto,
    actorUserId: string | null,
  ): Promise<ProjectOperatorEntity> {
    return this.console.transaction(async (manager) => {
      await this.loadOrFail(manager, projectId, false);

      const existing = await manager.findOne(ProjectOperatorEntity, {
        where: { projectId, opName: dto.opName },
      });

      const operator = await manager.save(
        existing
          ? Object.assign(existing, stripUndefined(dto))
          : manager.create(ProjectOperatorEntity, { projectId, ...dto }),
      );

      await this.auditNested(manager, actorUserId, projectId, 'operator', {
        opName: dto.opName,
        created: !existing,
      });

      return operator;
    });
  }

  async removeOperator(
    projectId: string,
    operatorId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.console.transaction(async (manager) => {
      const operator = await manager.findOne(ProjectOperatorEntity, {
        where: { id: operatorId, projectId },
      });
      if (!operator) throw new NotFoundException('Operator not found for this project.');

      await this.auditNested(manager, actorUserId, projectId, 'operator_removed', {
        opName: operator.opName,
      });

      await manager.delete(ProjectOperatorEntity, { id: operatorId });
    });
  }

  async upsertOperatorOpType(
    projectId: string,
    operatorId: string,
    opTypeId: string | null,
    dto: UpsertOperatorOpTypeDto,
    actorUserId: string | null,
  ): Promise<ProjectOperatorOpTypeEntity> {
    return this.console.transaction(async (manager) => {
      // Verified against the project as well as the operator, so a caller
      // cannot reach another project's operator by guessing its id.
      const operator = await manager.findOne(ProjectOperatorEntity, {
        where: { id: operatorId, projectId },
      });
      if (!operator) throw new NotFoundException('Operator not found for this project.');

      const existing = opTypeId
        ? await manager.findOne(ProjectOperatorOpTypeEntity, {
            where: { id: opTypeId, operatorId },
          })
        : null;

      if (opTypeId && !existing) throw new NotFoundException('Operation type not found.');

      const opType = await manager.save(
        existing
          ? Object.assign(existing, stripUndefined(dto))
          : manager.create(ProjectOperatorOpTypeEntity, {
              operatorId,
              ...dto,
              name: dto.name ?? null,
              currencies: dto.currencies ?? null,
            }),
      );

      await this.auditNested(manager, actorUserId, projectId, 'operator_op_type', {
        operatorId,
        created: !existing,
      });

      return opType;
    });
  }

  async removeOperatorOpType(
    projectId: string,
    operatorId: string,
    opTypeId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.console.transaction(async (manager) => {
      const operator = await manager.findOne(ProjectOperatorEntity, {
        where: { id: operatorId, projectId },
      });
      if (!operator) throw new NotFoundException('Operator not found for this project.');

      const opType = await manager.findOne(ProjectOperatorOpTypeEntity, {
        where: { id: opTypeId, operatorId },
      });
      if (!opType) throw new NotFoundException('Operation type not found.');

      await this.auditNested(manager, actorUserId, projectId, 'operator_op_type_removed', {
        operatorId,
        opTypeId,
      });

      await manager.delete(ProjectOperatorOpTypeEntity, { id: opTypeId });
    });
  }

  /* --------------------------------------------------------- blockers ---- */

  /** One row per project (OneToOne), so this is an upsert, not a create. */
  async setBlockers(
    projectId: string,
    dto: SetProjectBlockersDto,
    actorUserId: string | null,
  ): Promise<ProjectBlockerEntity> {
    return this.console.transaction(async (manager) => {
      await this.loadOrFail(manager, projectId, false);

      const existing = await manager.findOne(ProjectBlockerEntity, { where: { projectId } });

      const blockers = await manager.save(
        existing
          ? Object.assign(existing, {
              playerBlockers: dto.playerBlockers ?? existing.playerBlockers,
              reason: dto.reason ?? existing.reason,
            })
          : manager.create(ProjectBlockerEntity, {
              projectId,
              playerBlockers: dto.playerBlockers ?? null,
              reason: dto.reason ?? null,
            }),
      );

      await this.auditNested(manager, actorUserId, projectId, 'blockers', {
        created: !existing,
      });

      return blockers;
    });
  }

  /* ---------------------------------------------------------- helpers ---- */

  private async assertIdentifiersFree(
    manager: EntityManager,
    project: string,
    projectDb: string,
  ): Promise<void> {
    if (await manager.findOne(ProjectEntity, { where: { project } })) {
      throw new ConflictException('A project with this identifier already exists.');
    }
    if (await manager.findOne(ProjectEntity, { where: { projectDb } })) {
      throw new ConflictException('A project with this database identifier already exists.');
    }
  }

  private async loadOrFail(
    manager: EntityManager,
    id: string,
    withNested: boolean,
  ): Promise<ProjectEntity> {
    const project = await manager.findOne(ProjectEntity, {
      where: { id },
      relations: withNested
        ? { limits: true, operators: { opTypes: true }, blockers: true }
        : undefined,
    });

    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  private auditNested(
    manager: EntityManager,
    actorUserId: string | null,
    projectId: string,
    change: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.recordWith(manager, {
      eventType: AuthEventType.ProjectUpdated,
      outcome: AuthEventOutcome.Success,
      actorUserId,
      targetType: 'project',
      targetId: projectId,
      metadata: { change, ...metadata },
    });
  }
}

/**
 * Drops `undefined` so `Object.assign` cannot blank a column the caller never
 * mentioned. With `whitelist` + `forbidNonWhitelisted` an absent optional field
 * arrives as `undefined`, and assigning it would overwrite the stored value.
 */
function stripUndefined<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
