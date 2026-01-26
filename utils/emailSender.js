const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail({ to, subject, html, text, from }) {
  if (!resend) throw new Error("RESEND_API_KEY não configurada.");

  const fromAddress = from || process.env.EMAIL_FROM;
  if (!fromAddress) throw new Error("EMAIL_FROM não configurada.");

  return resend.emails.send({
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });
}

module.exports = { sendEmail };
