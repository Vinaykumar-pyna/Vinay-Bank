import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { CardsService } from './cards.service';
import {
  HotlistCardDto,
  IssueCardDto,
  OtpProofDto,
  SetPinDto,
  UpdateCardSettingsDto,
} from './dto/cards.dto';

class CardOtpDto {
  @IsIn(['REVEAL', 'PIN'])
  purpose: 'REVEAL' | 'PIN';
}

@ApiTags('Cards')
@ApiBearerAuth('access-token')
@Roles(Role.CUSTOMER)
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  @ApiOperation({ summary: 'My debit cards' })
  list(@CurrentUser() user: AuthUser) {
    return this.cards.list(user);
  }

  @Post()
  @ApiOperation({ summary: 'Issue a virtual RuPay debit card for one of my accounts' })
  issue(
    @CurrentUser() user: AuthUser,
    @Body() dto: IssueCardDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.issue(user, dto.accountId, ctx);
  }

  @Post(':id/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send an OTP to view card details or set the PIN' })
  otp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CardOtpDto) {
    return this.cards.challenge(user, id, dto.purpose === 'REVEAL' ? 'CARD_REVEAL' : 'CARD_PIN');
  }

  @Post(':id/reveal')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Full card number, expiry and CVV (OTP verified, never cached)' })
  reveal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OtpProofDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.reveal(user, id, dto.challengeId, dto.otp, ctx);
  }

  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or change the card PIN (OTP verified)' })
  setPin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetPinDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.setPin(user, id, dto.challengeId, dto.otp, dto.pin, ctx);
  }

  @Patch(':id/settings')
  @ApiOperation({ summary: 'Turn channels on or off and change daily limits' })
  settings(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCardSettingsDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.updateSettings(user, id, dto, ctx);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Temporarily block the card' })
  block(@CurrentUser() user: AuthUser, @Param('id') id: string, @ReqContext() ctx: RequestContext) {
    return this.cards.setBlocked(user, id, true, ctx);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a temporarily blocked card' })
  unblock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.setBlocked(user, id, false, ctx);
  }

  @Post(':id/hotlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report the card lost, stolen or damaged (permanent)' })
  hotlist(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: HotlistCardDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.cards.hotlist(user, id, dto, ctx);
  }
}
