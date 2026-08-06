import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  ApproveInvitationDto,
  RejectInvitationDto,
} from '$/api/invitations/dto/approve-invitation.dto';
import { InvitationApprovalService } from '$/api/invitations/services/invitation-approval.service';
import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * Approval — the gate between "someone proved who they are" and "someone has
 * access" (dossier 0.8).
 *
 * Mounted at `invitations/pending` and `invitations/:id/approve` rather than on
 * `InvitationController`, because these routes run on the CONSOLE connection
 * while the invite/validate/accept routes run on the authority one. Keeping the
 * two principals in separate controllers makes it visible in the file which
 * privilege a route executes with.
 *
 * `users.approve` is a distinct permission from `users.invite`: issuing an
 * invitation and granting access are different acts, and an operator who may do
 * the first should not automatically be able to do the second.
 */
@Controller('invitations')
export class InvitationApprovalController {
  constructor(private readonly approvals: InvitationApprovalService) {}

  @Get('pending')
  @PlatformPermissions(['users', 'approve'])
  listPending(@Query() query: PaginationQueryDto) {
    return this.approvals.listPending(query);
  }

  /**
   * Creates the identity. This is the only endpoint on the platform that does
   * so from an invitation, and it is one transaction on one connection —
   * user + grants + audit + delete, all or nothing (0.44).
   */
  @Post(':id/approve')
  @PlatformPermissions(['users', 'approve'])
  @HttpCode(HttpStatus.CREATED)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.approvals.approve(id, dto, request.tokenClaims?.sub ?? null);
  }

  @Delete(':id')
  @PlatformPermissions(['users', 'approve'])
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.approvals.reject(id, dto, request.tokenClaims?.sub ?? null);
  }
}
