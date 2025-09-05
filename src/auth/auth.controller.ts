import { Roles } from './roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { Role } from '@prisma/client';
import { UsersService } from 'src/users/users.service';
import {
  Body,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ResendEmailVerificationDto } from './dto/resend-email.dto';
import {
  RequestWithCookies,
  RequestWithUser,
} from 'src/common/types/auth.types';
import { Auth } from 'src/common/decorators/auth.decorator';
import { ApiController } from 'src/common/decorators/custom-controller.decorator';

@ApiController('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in and received tokens',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Invalid credentials' })
  @UseGuards(LocalAuthGuard)
  login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(loginDto, res);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description:
      'User successfully registered and waiting for email verification',
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({
    status: 409,
    description: 'User with this email or username already exists',
  })
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('refresh')
  @ApiCookieAuth('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 201,
    description: 'Tokens successfully refreshed',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token or refresh token expired',
  })
  async refreshToken(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }
    return await this.authService.refreshTokens(refreshToken, res);
  }

@Get('verify-email')
async verifyEmailWithLink(@Query('token') token: string, @Res() res: Response) {
  try {
    if (!token) {
      throw new Error('Verification token is missing');
    }
    await this.authService.verifyEmailWithToken(token);

    return res.status(200).send(`
      <html>
        <head><title>Email Verified</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:2rem;">
          <h1>✅ Email successfully verified!</h1>
          <p>You can close this page.</p>
        </body>
      </html>
    `);
  } catch (error) {
    return res.status(400).send(`
      <html>
        <head><title>Verification Failed</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:2rem;">
          <h1>❌ Verification failed</h1>
          <p>${error.message || 'Invalid or expired token'}</p>
        </body>
      </html>
    `);
  }
}


  @Post('resend-verification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiBody({ type: ResendEmailVerificationDto })
  @ApiResponse({
    status: 200,
    description:
      'If this email is registered and not verified, a verification email has been sent. Please check your inbox or spam folder.',
  })
  @ApiResponse({
    status: 400,
    description: 'Email already verified',
  })
  async resendVerificationEmail(
    @Body() resendEmailVerificationDto: ResendEmailVerificationDto,
  ) {
    return await this.authService.resendVerificationEmail(
      resendEmailVerificationDto.email,
    );
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Forgot password' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'If this email is registered, a password reset email has been sent. Please check your inbox or spam folder.',
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
  })
  @ApiResponse({
    status: 403,
    description: 'Invalid or expired reset token',
  })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('profile')
  @Auth()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
  })
  getProfile(@Req() req: Request) {
    return req.user;
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
  })
  getCurrentUser(@Req() req: Request) {
    return req.user;
  }
  

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
  })
  @Auth()
  logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(req.user.id, res);
  }
}
