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

  it('welcomes a Google user in English without sending credentials', async () => {
    await handler.handle(new WelcomeUserEvent(user));
    const content = sendMail.mock.calls[0][0];
    expect(content.subject).toBe('Welcome to Unslopy');
    expect(content.html).toContain('<html lang="en">');
    expect(content.html).toContain('Hello &lt;Alice&gt;,');
    expect(content.text).toContain('Hello <Alice>,');
    expect(content.text).toContain('Your account is ready. You can sign in with Google and manage your profile.');
    expect(content.text).toContain('The Unslopy team');
    expect(content.html).toContain('Unslopy');
    expect(content.html).not.toContain('unslop-docs');
    expect(content.text).not.toContain('unslop-docs');
    expect(content.html).not.toMatch(/password|credential/i);
    expect(content.text).not.toMatch(/password|credential/i);
  });

  it('translates mail delivery failures', async () => {
    sendMail.mockRejectedValue(new Error('SMTP details'));
    await expect(handler.handle(new WelcomeUserEvent(user))).rejects.toThrow('Unable to send email');
  });
});
