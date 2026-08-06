import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';

import {
  CreateProjectDto,
  ProjectQueryDto,
  SetProjectBlockersDto,
  UpdateProjectDto,
  UpsertOperatorOpTypeDto,
  UpsertProjectLimitDto,
  UpsertProjectOperatorDto,
} from '$/api/projects/dto/project.dto';
import { ProjectsService } from '$/api/projects/services/projects.service';
import { actorOf } from '$/api/users/controllers/users.controller';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * Project administration.
 *
 * PLATFORM-scoped, not project-scoped, even though the resource is a project:
 * `@RequirePermissions` would ask "may you do this WITHIN project X", and
 * creating a project has no X to be within. Managing the tenant list is a
 * platform act; acting inside a tenant is what the project scope is for
 * (dossier 0.43).
 *
 * The nested resources carry their own permission sections — `projectLimits`
 * and `projectOperators` — so an operator who may tune limits does not thereby
 * gain the ability to create or delete projects.
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @PlatformPermissions(['projects', 'view'])
  list(@Query() query: ProjectQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  @PlatformPermissions(['projects', 'view'])
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  @PlatformPermissions(['projects', 'create'])
  create(@Body() dto: CreateProjectDto, @Req() request: AuthenticatedRequest) {
    return this.projects.create(dto, actorOf(request));
  }

  @Patch(':id')
  @PlatformPermissions(['projects', 'update'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.update(id, dto, actorOf(request));
  }

  @Delete(':id')
  @PlatformPermissions(['projects', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.projects.remove(id, actorOf(request));
  }

  /* ----------------------------------------------------------- limits ---- */

  @Put(':id/limits')
  @PlatformPermissions(['projectLimits', 'update'])
  upsertLimit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertProjectLimitDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.upsertLimit(id, dto, actorOf(request));
  }

  @Delete(':id/limits/:limitId')
  @PlatformPermissions(['projectLimits', 'update'])
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLimit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('limitId', ParseUUIDPipe) limitId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.removeLimit(id, limitId, actorOf(request));
  }

  /* -------------------------------------------------------- operators ---- */

  @Put(':id/operators')
  @PlatformPermissions(['projectOperators', 'update'])
  upsertOperator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertProjectOperatorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.upsertOperator(id, dto, actorOf(request));
  }

  @Delete(':id/operators/:operatorId')
  @PlatformPermissions(['projectOperators', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  removeOperator(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.removeOperator(id, operatorId, actorOf(request));
  }

  @Post(':id/operators/:operatorId/op-types')
  @PlatformPermissions(['projectOperators', 'create'])
  createOpType(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Body() dto: UpsertOperatorOpTypeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.upsertOperatorOpType(id, operatorId, null, dto, actorOf(request));
  }

  @Patch(':id/operators/:operatorId/op-types/:opTypeId')
  @PlatformPermissions(['projectOperators', 'update'])
  updateOpType(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Param('opTypeId', ParseUUIDPipe) opTypeId: string,
    @Body() dto: UpsertOperatorOpTypeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.upsertOperatorOpType(id, operatorId, opTypeId, dto, actorOf(request));
  }

  @Delete(':id/operators/:operatorId/op-types/:opTypeId')
  @PlatformPermissions(['projectOperators', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  removeOpType(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Param('opTypeId', ParseUUIDPipe) opTypeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.removeOperatorOpType(id, operatorId, opTypeId, actorOf(request));
  }

  /* --------------------------------------------------------- blockers ---- */

  @Put(':id/blockers')
  @PlatformPermissions(['projects', 'update'])
  setBlockers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProjectBlockersDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projects.setBlockers(id, dto, actorOf(request));
  }
}
