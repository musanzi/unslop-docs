import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { User } from '../../users/entities';
import { IUserResponse, UserResponse } from '../../users/interfaces';
import { ForgotPasswordDto, ResetPasswordDto, SignInDto, SignUpDto, UpdatePasswordDto, UpdateProfileDto } from '../dto';
import { CurrentUser, Public } from '../decorators';
import { GoogleAuthGuard, LocalAuthGuard } from '../guards';
import { ForgotPassword, ResetPassword, SignOut, SignUp, UpdatePassword, UpdateProfile } from '../commands';
import { GoogleRedirect, GetProfile, SignIn } from '../queries';

@ApiTags('auth')
@Controller('auth')
export class AuthController extends AbstractController {
  @Post('signup')
  @Public()
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({ type: UserResponse, description: 'User registered' })
  signUp(@Body() dto: SignUpDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new SignUp(dto));
  }

  @Post('signin')
  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({ type: UserResponse, description: 'Signed in' })
  signIn(@Req() req: Request): Promise<IUserResponse> {
    return this.queryHandler.execute(new SignIn(req));
  }

  @Get('signin/google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google OAuth sign in' })
  googleAuth(): void {}

  @Get('google/redirect')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth redirect callback' })
  googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.queryHandler.execute(new GoogleRedirect(res, req.query.state));
  }

  @Post('signout')
  @ApiOperation({ summary: 'Sign out the current user' })
  @ApiOkResponse({ description: 'Signed out' })
  signOut(@Req() req: Request): Promise<void> {
    return this.commandHandler.execute(new SignOut(req));
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ type: UserResponse, description: 'Current user profile' })
  profile(@CurrentUser() user: User): Promise<IUserResponse> {
    return this.queryHandler.execute(new GetProfile(user.email));
  }

  @Patch('me/update')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ type: UserResponse, description: 'Profile updated' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new UpdateProfile(user, dto));
  }

  @Patch('password/update')
  @ApiOperation({ summary: 'Update the current user password' })
  @ApiOkResponse({ type: UserResponse, description: 'Password updated' })
  updatePassword(@CurrentUser() user: User, @Body() dto: UpdatePasswordDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new UpdatePassword(user, dto));
  }

  @Post('password/forgot')
  @Public()
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ description: 'Password reset email sent' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.commandHandler.execute(new ForgotPassword(dto));
  }

  @Post('password/reset')
  @Public()
  @ApiOperation({ summary: 'Reset password with a token' })
  @ApiOkResponse({ type: UserResponse, description: 'Password reset' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new ResetPassword(dto));
  }
}
