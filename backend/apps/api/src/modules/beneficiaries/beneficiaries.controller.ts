import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { BeneficiariesService } from './beneficiaries.service';
import { AddBeneficiaryDto } from './dto/beneficiary.dto';

@ApiTags('Beneficiaries')
@ApiBearerAuth('access-token')
@Roles(Role.CUSTOMER)
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @ApiOperation({ summary: 'Saved payees' })
  list(@CurrentUser() user: AuthUser) {
    return this.beneficiaries.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a payee (IFSC verified; transfers capped during the cooling period)',
  })
  add(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddBeneficiaryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.beneficiaries.add(user, dto, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a payee' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    await this.beneficiaries.remove(user, id, ctx);
  }
}
