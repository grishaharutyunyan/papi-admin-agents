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
  CreateUserDto,
  SetActiveDto,
  SetTemporaryPasswordDto,
  UnauthorizeUserDto,
  UpdateUserAccessDto,
  UpdateUserDto,
  UserQueryDto,
} from '$/api/users/dto/user.dto';
import { UsersService } from '$/api/users/services/users.service';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * Identity administration — the surface access-control consumes.
 *
 * Every route is PLATFORM-scoped (dossier 0.43): managing people belongs to no
 * tenant, so there is no `x-project-id` and the guard reads the `platform`
 * claim. Nothing here is `@SkipPermissions` — under default-deny an undecorated
 * route is refused, so a forgotten decorator fails closed.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @PlatformPermissions(['users', 'view'])
  list(@Query() query: UserQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @PlatformPermissions(['users', 'view'])
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @PlatformPermissions(['users', 'create'])
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest) {
    return this.users.create(dto, actorOf(request));
  }

  @Patch(':id')
  @PlatformPermissions(['users', 'update'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.update(id, dto, actorOf(request));
  }

  /**
   * Role / project / panel grants. Separate from the profile PATCH because it
   * revokes every live session (0.46) — a change that logs someone out should
   * never be reachable by editing their phone number.
   */
  @Put(':id/access')
  @PlatformPermissions(['users', 'update'])
  updateAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserAccessDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.updateAccess(id, dto, actorOf(request));
  }

  @Put(':id/active')
  @PlatformPermissions(['users', 'update'])
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.setActive(id, dto, actorOf(request));
  }

  /**
   * Temporary password (dossier 0.22). This platform has no forgot-password
   * flow by design — recovery is an administrator action, out of band, so email
   * is never a path back into an account.
   */
  @Put(':id/password')
  @PlatformPermissions(['users', 'update'])
  @HttpCode(HttpStatus.NO_CONTENT)
  setTemporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTemporaryPasswordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.setTemporaryPassword(id, dto, actorOf(request));
  }

  /** The Part I kill switch: deactivate + revoke every refresh family. */
  @Post(':id/unauthorize')
  @PlatformPermissions(['users', 'unauthorize'])
  @HttpCode(HttpStatus.OK)
  unauthorize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnauthorizeUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.unauthorize(id, dto, actorOf(request));
  }

  @Delete(':id')
  @PlatformPermissions(['users', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.users.remove(id, actorOf(request));
  }
}

export function actorOf(request: AuthenticatedRequest): string | null {
  return request.tokenClaims?.sub ?? null;
}
