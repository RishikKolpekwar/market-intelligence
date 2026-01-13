import { MailerSend, EmailParams, Sender, Recipient, Attachment } from 'mailersend';

const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY || '',
});

interface SendBriefingEmailParams {
  to: string;
  toName: string;
  subject: string;
  html: string;
  pdfAttachment?: {
    content: string; // base64 encoded PDF
    filename: string;
  };
}

export async function sendBriefingEmail({
  to,
  toName,
  subject,
  html,
  pdfAttachment,
}: SendBriefingEmailParams) {
  const sentFrom = new Sender(
    process.env.MAILERSEND_FROM_EMAIL || 'noreply@yourdomain.com',
    'Market Intelligence Briefing'
  );

  const recipients = [new Recipient(to, toName)];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setSubject(subject)
    .setHtml(html);

  // Add PDF attachment if provided
  if (pdfAttachment) {
    const attachment = new Attachment(
      pdfAttachment.content,
      pdfAttachment.filename,
      'attachment'
    );
    emailParams.setAttachments([attachment]);
  }

  try {
    const response = await mailerSend.email.send(emailParams);
    console.log('[MailerSend] Email sent successfully:', response);
    return { success: true, response };
  } catch (error) {
    console.error('[MailerSend] Error sending email:', error);
    throw error;
  }
}
