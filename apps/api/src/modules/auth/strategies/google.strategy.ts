import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { IGoogleProfile } from '../interfaces';
import { CommandBus } from '@nestjs/cqrs';
import { FindOrCreateUser } from '@api/modules/users/commands';
import { IUserResponse } from '@api/modules/users/interfaces';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly commandBus: CommandBus
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_SECRET'),
      callbackURL: configService.get('GOOGLE_REDIRECT_URI'),
      scope: ['profile', 'email'],
      state: true
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: IGoogleProfile): Promise<IUserResponse> {
    const { emails, name, photos } = profile;
    if (!profile.id || !emails?.[0]?.value || emails[0].verified !== true) {
      throw new UnauthorizedException('A verified Google email is required');
    }
    return await this.commandBus.execute(
      new FindOrCreateUser({
        subject: profile.id,
        emailVerified: true,
        email: emails[0]['value'],
        name: [name?.givenName, name?.familyName].filter(Boolean).join(' ') || emails[0].value,
        avatar: photos?.[0]?.value
      })
    );
  }
}
