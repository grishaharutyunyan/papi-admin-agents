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
  CreateUserRoleDto,
  SetRolePermissionsDto,
  UpdateUserRoleDto,
} from '$/api/users/dto/user-role.dto';
import { UserRolesService } from '$/api/users/services/user-roles.service';
import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

import { actorOf } from './users.controller';

@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly roles: UserRolesService) {}

  @Get()
  @PlatformPermissions(['userRoles', 'view'])
  list(@Query() query: PaginationQueryDto) {
    return this.roles.list(query);
  }

  @Get(':id')
  @PlatformPermissions(['userRoles', 'view'])
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  @PlatformPermissions(['userRoles', 'create'])
  create(@Body() dto: CreateUserRoleDto, @Req() request: AuthenticatedRequest) {
    return this.roles.create(dto, actorOf(request));
  }

  @Patch(':id')
  @PlatformPermissions(['userRoles', 'update'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.update(id, dto, actorOf(request));
  }

  /** Full replacement of L3. Revokes the sessions of everyone holding the role. */
  @Put(':id/permissions')
  @PlatformPermissions(['userRoles', 'update'])
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.setPermissions(id, dto, actorOf(request));
  }

  @Delete(':id')
  @PlatformPermissions(['userRoles', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.roles.remove(id, actorOf(request));
  }
}
