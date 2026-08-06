import { Body, Controller, Get, Put, Req } from '@nestjs/common';

import { UpdatePlatformSettingsDto } from '$/api/platform-settings/dto/platform-settings.dto';
import { PlatformSettingsService } from '$/api/platform-settings/services/platform-settings.service';
import { actorOf } from '$/api/users/controllers/users.controller';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/** No POST, no DELETE — the row is a singleton enforced by the database. */
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @PlatformPermissions(['platformSettings', 'view'])
  get() {
    return this.settings.get();
  }

  @Put()
  @PlatformPermissions(['platformSettings', 'update'])
  update(@Body() dto: UpdatePlatformSettingsDto, @Req() request: AuthenticatedRequest) {
    return this.settings.update(dto, actorOf(request));
  }
}
