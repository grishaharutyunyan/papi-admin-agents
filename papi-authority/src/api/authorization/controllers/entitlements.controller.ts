import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';

import {
  SetProjectEntitlementsDto,
  SetUserOverridesDto,
} from '$/api/authorization/dto/authorization.dto';
import { PERMISSION_CATALOG, flattenCatalog } from '$/api/authorization/permission-catalog';
import { EntitlementsService } from '$/api/authorization/services/entitlements.service';
import { actorOf } from '$/api/users/controllers/users.controller';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * L2 and L4 administration.
 *
 * The catalog endpoint exists so the console can render a permission picker
 * without hard-coding the list — which is exactly the drift that left
 * rmp-frontend missing five actions its own backend enforces (dossier F.4).
 * There is one source of truth, it lives in code, and this is how the UI reads
 * it.
 */
@Controller('authorization')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('catalog')
  @PlatformPermissions(['entitlements', 'view'])
  catalog() {
    return { sections: PERMISSION_CATALOG, permissions: flattenCatalog() };
  }

  @Get('projects/:projectId/entitlements')
  @PlatformPermissions(['entitlements', 'view'])
  listForProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.entitlements.listForProject(projectId);
  }

  /** Replaces the project's ceiling; revokes every member's sessions. */
  @Put('projects/:projectId/entitlements')
  @PlatformPermissions(['entitlements', 'update'])
  setForProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SetProjectEntitlementsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.entitlements.setForProject(projectId, dto, actorOf(request));
  }

  @Get('users/:userId/projects/:projectId/overrides')
  @PlatformPermissions(['users', 'view'])
  listForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.entitlements.listForUser(userId, projectId);
  }

  /**
   * L4 overrides are a user-access change, so they take `users.update` rather
   * than `entitlements.update` — the person being changed is the subject here,
   * not the project's licence.
   */
  @Put('users/:userId/projects/:projectId/overrides')
  @PlatformPermissions(['users', 'update'])
  setForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SetUserOverridesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.entitlements.setForUser(userId, projectId, dto, actorOf(request));
  }
}
