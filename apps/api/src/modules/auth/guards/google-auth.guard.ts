import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      const canActivate = await super.canActivate(context);
      if (request.user) await super.logIn(request);
      return Boolean(canActivate);
    } catch {
      const reason = request.query.error === 'access_denied' ? 'google-cancelled' : 'google-failed';
      const redirect = new URL('/auth/sign-in', this.config.getOrThrow<string>('FRONTEND_URI'));
      redirect.searchParams.set('error', reason);
      response.redirect(redirect.toString());
      return false;
    }
  }
}
