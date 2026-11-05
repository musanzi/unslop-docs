import { BadRequestException } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MailerService } from '@nestjs-modules/mailer';
import { buildEmailBody } from '@api/shared/helpers';
import { WelcomeUserEvent } from '../impl';

@EventsHandler(WelcomeUserEvent)
export class SendWelcomeEmailHandler implements IEventHandler<WelcomeUserEvent> {
  constructor(private mailerService: MailerService) {}

  async handle(event: WelcomeUserEvent): Promise<void> {
    try {
      const content = buildEmailBody({
        title: 'Welcome to unslop-docs',
        greetingName: event.user.name,
        intro: 'Your account is ready. You can sign in with Google and manage your profile.'
      });

      await this.mailerService.sendMail({
        to: event.user.email,
        subject: 'Welcome to unslop-docs',
        ...content
      });
    } catch {
      throw new BadRequestException('Unable to send email');
    }
  }
}
