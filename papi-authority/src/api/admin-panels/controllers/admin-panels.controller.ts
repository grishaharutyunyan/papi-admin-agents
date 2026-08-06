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
  ConfigureAdminPanelAuthDto,
  CreateAdminPanelDto,
  UpdateAdminPanelDto,
} from '$/api/admin-panels/dto/admin-panel.dto';
import { AdminPanelsService } from '$/api/admin-panels/services/admin-panels.service';
import { actorOf } from '$/api/users/controllers/users.controller';
import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

@Controller('admin-panels')
export class AdminPanelsController {
  constructor(private readonly panels: AdminPanelsService) {}

  @Get()
  @PlatformPermissions(['adminPanels', 'view'])
  list(@Query() query: PaginationQueryDto) {
    return this.panels.list(query);
  }

  @Get(':id')
  @PlatformPermissions(['adminPanels', 'view'])
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.panels.findOne(id);
  }

  @Post()
  @PlatformPermissions(['adminPanels', 'create'])
  create(@Body() dto: CreateAdminPanelDto, @Req() request: AuthenticatedRequest) {
    return this.panels.create(dto, actorOf(request));
  }

  @Patch(':id')
  @PlatformPermissions(['adminPanels', 'update'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminPanelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.panels.update(id, dto, actorOf(request));
  }

  /**
   * Deciding how a panel authenticates is a stronger act than renaming it, so
   * it takes its own permission. An operator trusted to manage panel metadata
   * should not thereby be able to turn on password login for an Azure-only
   * panel.
   */
  @Put(':id/auth')
  @PlatformPermissions(['adminPanels', 'configureAuth'])
  configureAuth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigureAdminPanelAuthDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.panels.configureAuth(id, dto, actorOf(request));
  }

  @Delete(':id')
  @PlatformPermissions(['adminPanels', 'delete'])
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.panels.remove(id, actorOf(request));
  }
}
