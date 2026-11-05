import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { IUserResponse, UserResponse } from '../../users/interfaces';
import { UpdateProfileDto } from '../dto';
import { CurrentUser, Public } from '../decorators';
import { GoogleAuthGuard } from '../guards';
import { SignOut, UpdateProfile } from '../commands';
import { GoogleRedirect } from '../queries';

@ApiTags('auth')
@Controller('auth')
export class AuthController extends AbstractController {
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
  profile(@CurrentUser() user: IUserResponse): IUserResponse {
    return user;
  }

  @Patch('me/update')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ type: UserResponse, description: 'Profile updated' })
  async updateProfile(@CurrentUser() user: IUserResponse, @Body() dto: UpdateProfileDto): Promise<IUserResponse> {
    const updated = await this.commandHandler.execute(new UpdateProfile(user, dto));
    return { ...updated, isAdmin: user.isAdmin };
  }
}
