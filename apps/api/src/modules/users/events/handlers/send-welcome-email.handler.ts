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
        title: 'Bienvenue sur unslop-docs',
        greetingName: event.user.name,
        intro:
          'Votre compte a bien été créé. Vous pouvez maintenant vous connecter et commencer à utiliser unslop-docs.'
      });

      await this.mailerService.sendMail({
        to: event.user.email,
        subject: 'Bienvenue sur unslop-docs',
        ...content
      });
    } catch {
      throw new BadRequestException("Envoi d'email impossible");
    }
  }
}
