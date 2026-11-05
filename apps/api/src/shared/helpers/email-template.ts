import { convert } from 'html-to-text';

type EmailAction = {
  label: string;
  url: string;
};

type EmailTemplateOptions = {
  title: string;
  greetingName: string;
  intro: string;
  body?: string[];
  action?: EmailAction;
  highlight?: {
    label: string;
    value: string;
  };
  note?: string;
};

type EmailContent = {
  html: string;
  text: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const paragraph = (value: string): string =>
  `<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:26px;overflow-wrap:break-word;">${escapeHtml(value)}</p>`;

export const buildEmailBody = (options: EmailTemplateOptions): EmailContent => {
  const action = options.action
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="email-action" style="margin:8px 0 24px;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius:6px;mso-padding-alt:14px 24px;">
            <a href="${escapeHtml(options.action.url)}" style="display:block;padding:14px 24px;border:1px solid #2563eb;border-radius:6px;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;text-align:center;text-decoration:none;mso-padding-alt:0;">${escapeHtml(options.action.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:20px;">If the link does not work, copy this address into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;">
        <a href="${escapeHtml(options.action.url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(options.action.url)}</a>
      </p>`
    : '';

  const highlight = options.highlight
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 24px;table-layout:fixed;">
        <tr>
          <td bgcolor="#f8fafc" style="padding:20px;border:1px solid #e2e8f0;border-radius:6px;">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:20px;">${escapeHtml(options.highlight.label)}</p>
            <p style="margin:0;color:#0f172a;font-family:Consolas,'Courier New',monospace;font-size:20px;font-weight:600;line-height:28px;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(options.highlight.value)}</p>
          </td>
        </tr>
      </table>`
    : '';

  const note = options.note
    ? `<p style="margin:0 0 24px;color:#64748b;font-size:13px;line-height:21px;overflow-wrap:break-word;">${escapeHtml(options.note)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
    <title>${escapeHtml(options.title)}</title>
    <style>
      body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table, td { mso-table-lspace:0; mso-table-rspace:0; }
      @media only screen and (max-width:600px) {
        .email-wrapper { padding:24px 12px !important; }
        .email-content { padding:28px 24px !important; }
        .email-title { font-size:24px !important; line-height:32px !important; }
        .email-action { width:100% !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9">
      <tr>
        <td align="center" class="email-wrapper" style="padding:48px 24px;">
          <!--[if mso]>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600"><tr><td>
          <![endif]-->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;table-layout:fixed;">
            <tr>
              <td bgcolor="#ffffff" class="email-content" style="padding:40px;border:1px solid #e2e8f0;border-radius:6px;">
                <p style="margin:0 0 28px;color:#64748b;font-size:14px;font-weight:700;line-height:20px;letter-spacing:1px;">Unslopy</p>
                <h1 class="email-title" style="margin:0 0 28px;color:#0f172a;font-size:28px;font-weight:700;line-height:36px;overflow-wrap:break-word;">${escapeHtml(options.title)}</h1>

                ${paragraph(`Hello ${options.greetingName},`)}

                ${paragraph(options.intro)}

                ${(options.body ?? []).map(paragraph).join('\n\n                ')}

                ${action}

                ${highlight}

                ${note}

                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;">
                  <tr>
                    <td style="padding-top:24px;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#64748b;font-size:14px;line-height:22px;">The <strong style="color:#334155;">Unslopy</strong> team</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    html,
    text: convert(html, {
      wordwrap: 120,
      selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' }
      ]
    })
  };
};
