import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public, ReqContext } from '../../common/decorators/auth.decorators';
import { XhrHeaderGuard } from '../../common/guards/xhr-header.guard';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import type { AppConfig } from '../../config/configuration';
import { AuthService, type AuthenticatedResult, type LoginResult } from './auth.service';
import {
  ChangePasswordDto,
  DisableMfaDto,
  LoginDto,
  MfaCodeDto,
  MfaLoginDto,
  RegisterDto,
} from './dto/auth.dto';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';

export const REFRESH_COOKIE = 'ab_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Stricter per-IP limit for credential endpoints, read per request from configuration. */
const AUTH_THROTTLE = {
  default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 },
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly cookieBase: CookieOptions;
  private readonly refreshMaxAgeMs: number;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    config: ConfigService<AppConfig, true>,
  ) {
    const authConfig = config.get('auth', { infer: true });
    // httpOnly: JavaScript (and therefore XSS) cannot read the refresh token.
    // SameSite=Strict + path scoping: the browser only sends it to /api/v1/auth on our own site.
    this.cookieBase = {
      httpOnly: true,
      secure: authConfig.cookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
    this.refreshMaxAgeMs = authConfig.refreshTtlDays * 86_400_000;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Open a customer profile (signs the customer in)' })
  async register(
    @Body() dto: RegisterDto,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withSession(res, await this.auth.register(dto, ctx));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password; may require a second factor' })
  async login(
    @Body() dto: LoginDto,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.loginResponse(res, await this.auth.login(dto, ctx));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login/mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete sign-in with an authenticator or recovery code' })
  async loginMfa(
    @Body() dto: MfaLoginDto,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.loginResponse(res, await this.auth.loginWithMfa(dto, ctx));
  }

  @Public()
  @UseGuards(XhrHeaderGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token (rotates the cookie)',
  })
  async refresh(
    @Req() req: Request,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return this.withSession(res, await this.auth.refresh(readRefreshCookie(req), ctx));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      throw error;
    }
  }

  @Public()
  @UseGuards(XhrHeaderGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out of this device' })
  async logout(
    @Req() req: Request,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), ctx);
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
  }

  @Public()
  @Get('jwks')
  @ApiOperation({ summary: 'Public keys (JWKS) for verifying access tokens' })
  jwks() {
    return this.tokens.getJwks();
  }

  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Profile of the signed-in user' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth('access-token')
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (signs out all other devices)' })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.changePassword(user, dto, ctx);
  }

  @ApiBearerAuth('access-token')
  @Get('sessions')
  @ApiOperation({ summary: 'Devices currently signed in' })
  listSessions(@CurrentUser() user: AuthUser) {
    return this.sessions.listActive(user.id, user.sessionId);
  }

  @ApiBearerAuth('access-token')
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out a specific device' })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    await this.auth.revokeSession(user, id, ctx);
  }

  @ApiBearerAuth('access-token')
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out every other device' })
  revokeOthers(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.auth.revokeOtherSessions(user, ctx);
  }

  @ApiBearerAuth('access-token')
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start two-factor setup: returns a QR code for the authenticator app' })
  beginMfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.beginMfaSetup(user);
  }

  @ApiBearerAuth('access-token')
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm two-factor setup with a code; returns one-time recovery codes',
  })
  enableMfa(
    @CurrentUser() user: AuthUser,
    @Body() dto: MfaCodeDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.auth.enableMfa(user, dto.code, ctx);
  }

  @ApiBearerAuth('access-token')
  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Turn off two-factor authentication (needs password and a code)' })
  async disableMfa(
    @CurrentUser() user: AuthUser,
    @Body() dto: DisableMfaDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    await this.auth.disableMfa(user, dto.password, dto.code, ctx);
  }

  // ---------------------------------------------------------------------------

  private loginResponse(res: Response, result: LoginResult) {
    if (result.mfaRequired) return result;
    return { mfaRequired: false, ...this.withSession(res, result) };
  }

  /** Moves the refresh token into the cookie; the JSON body only carries the access token. */
  private withSession(res: Response, result: AuthenticatedResult) {
    const { refreshToken, ...body } = result;
    if (refreshToken) {
      res.cookie(REFRESH_COOKIE, refreshToken, {
        ...this.cookieBase,
        maxAge: this.refreshMaxAgeMs,
      });
    }
    return { ...body, tokenType: 'Bearer' as const };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}
