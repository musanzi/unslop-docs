import { MailerService } from '@nestjs-modules/mailer';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeUserEvent } from '../impl';
import { SendWelcomeEmailHandler } from './send-welcome-email.handler';

describe('SendWelcomeEmailHandler', () => {
  const sendMail = vi.fn<MailerService['sendMail']>();
  const user = { name: '<Alice>', email: 'alice@example.com' };
  let handler: SendWelcomeEmailHandler;

  beforeEach(async () => {
    sendMail.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [SendWelcomeEmailHandler, { provide: MailerService, useValue: { sendMail } }]
    }).compile();
    handler = module.get(SendWelcomeEmailHandler);
  });

  it('welcomes a Google user without sending credentials', async () => {
    await handler.handle(new WelcomeUserEvent(user));
    const content = sendMail.mock.calls[0][0];
    expect(content.html).not.toContain('Mot de passe temporaire');
    expect(content.text).not.toContain('Mot de passe temporaire');
  });

  it('translates mail delivery failures', async () => {
    sendMail.mockRejectedValue(new Error('SMTP details'));
    await expect(handler.handle(new WelcomeUserEvent(user))).rejects.toThrow("Envoi d'email impossible");
  });
});
