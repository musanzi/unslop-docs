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

  it('sends generated credentials to the intended recipient with escaped HTML and plain text', async () => {
    await handler.handle(new WelcomeUserEvent(user, '000007'));
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Bienvenue sur unslop-docs',
        html: expect.stringContaining('&lt;Alice&gt;'),
        text: expect.stringContaining('000007')
      })
    );
    expect(sendMail.mock.calls[0][0].html).toContain('Mot de passe temporaire');
  });

  it('omits temporary credentials when the user chose their own password', async () => {
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
