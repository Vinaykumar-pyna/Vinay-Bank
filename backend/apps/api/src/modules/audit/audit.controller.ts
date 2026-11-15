import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { AuditAction } from './audit-actions';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Roles(Role.MANAGER, Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Search the audit trail (newest first)' })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  @Get('verify')
  @ApiOperation({ summary: 'Recompute the SHA-256 hash chain and report the first broken record' })
  async verify(@CurrentUser() user: AuthUser, @ReqContext() context: RequestContext) {
    const report = await this.audit.verifyChain();
    await this.audit.record({
      action: AuditAction.AUDIT_CHAIN_VERIFIED,
      outcome: report.valid ? 'SUCCESS' : 'FAILURE',
      actor: { id: user.id, role: user.role },
      context,
      details: {
        checked: report.checked,
        valid: report.valid,
        firstInvalidSeq: report.firstInvalidSeq,
      },
    });
    return report;
  }
}
