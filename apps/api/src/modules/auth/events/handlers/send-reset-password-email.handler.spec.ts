import { MailerService } from '@nestjs-modules/mailer';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordRequestedEvent } from '../impl';
import { SendResetPasswordEmailHandler } from './send-reset-password-email.handler';

describe('SendResetPasswordEmailHandler', () => {
  const sendMail = vi.fn<MailerService['sendMail']>();
  const event = new ResetPasswordRequestedEvent(
    { name: 'Alice', email: 'alice@example.com' },
    'https://web.example/reset?token=test-token'
  );
  let handler: SendResetPasswordEmailHandler;

  beforeEach(async () => {
    sendMail.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [SendResetPasswordEmailHandler, { provide: MailerService, useValue: { sendMail } }]
    }).compile();
    handler = module.get(SendResetPasswordEmailHandler);
  });

  it('sends the reset action and fallback link to the account email', async () => {
    await handler.handle(event);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: event.user.email,
        subject: 'Réinitialisation du mot de passe',
        html: expect.stringContaining(`href="${event.link}"`),
        text: expect.stringContaining(event.link)
      })
    );
  });

  it('translates mail delivery failures', async () => {
    sendMail.mockRejectedValue(new Error('SMTP details'));
    await expect(handler.handle(event)).rejects.toThrow("Envoi d'email impossible");
  });
});
