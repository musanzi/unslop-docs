import { describe, expect, it } from 'vitest';
import { buildEmailBody } from './email-template';

describe('buildEmailBody', () => {
  it('escapes user content in HTML while retaining readable plain text', () => {
    const content = buildEmailBody({
      title: 'Account <update>',
      greetingName: '<Alice & "Bob">',
      intro: "Don't <script>run()</script>",
      body: ['Details & more'],
      note: '<private>'
    });
    expect(content.html).toContain('Account &lt;update&gt;');
    expect(content.html).toContain('&lt;Alice &amp; &quot;Bob&quot;&gt;');
    expect(content.html).toContain('Don&#39;t &lt;script&gt;run()&lt;/script&gt;');
    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&lt;private&gt;');
    expect(content.text).toContain('Bonjour <Alice & "Bob">,');
    expect(content.text).toContain("Don't <script>run()</script>");
    expect(content.text).toContain('Details & more');
  });

  it('includes an escaped action URL and a readable fallback link', () => {
    const content = buildEmailBody({
      title: 'Reset',
      greetingName: 'Alice',
      intro: 'Reset your password',
      action: { label: 'Reset <now>', url: 'https://web.example/reset?a=1&b="2"' }
    });
    expect(content.html).toContain('href="https://web.example/reset?a=1&amp;b=&quot;2&quot;"');
    expect(content.html).toContain('Reset &lt;now&gt;');
    expect(content.text).toContain('https://web.example/reset?a=1&b="2"');
  });

  it('includes temporary credentials when explicitly provided', () => {
    const content = buildEmailBody({
      title: 'Welcome',
      greetingName: 'Alice',
      intro: 'Account created',
      highlight: { label: 'Temporary password', value: '000007' },
      note: 'Change this password'
    });
    expect(content.html).toContain('000007');
    expect(content.text).toContain('Temporary password');
    expect(content.text).toContain('000007');
    expect(content.text).toContain('Change this password');
  });

  it('omits optional content when no action, highlight, body, or note is supplied', () => {
    const content = buildEmailBody({ title: 'Welcome', greetingName: 'Alice', intro: 'Account created' });
    expect(content.html).not.toContain('<a href=');
    expect(content.html).not.toContain('undefined');
    expect(content.text).toContain('Account created');
  });
});
