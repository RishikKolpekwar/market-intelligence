import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.MAILERSEND_FROM_EMAIL || 'noreply@yourdomain.com';
const FROM_NAME = 'Market Intelligence Briefing';

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
  const attachments = pdfAttachment
    ? [
        {
          filename: pdfAttachment.filename,
          content: pdfAttachment.content, // Resend accepts base64 string directly
        },
      ]
    : undefined;

  // Format recipient with name if provided
  const recipient = toName ? `${toName} <${to}>` : to;

  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [recipient],
      subject,
      html,
      attachments,
    });

    if (error) {
      console.error('[Resend] Error sending email:', error);
      throw error;
    }

    console.log('[Resend] Email sent successfully:', data);
    return { success: true, response: data };
  } catch (error) {
    console.error('[Resend] Error sending email:', error);
    throw error;
  }
}
