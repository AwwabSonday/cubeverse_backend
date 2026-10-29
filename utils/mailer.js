import nodemailer from "nodemailer";

// Works with any SMTP provider (Gmail app password, Brevo, Mailtrap...). Configure SMTP_* in .env.
// Without SMTP_HOST the message is printed to the server console, so the flow still works in local dev.
export const sendMail = async ({ to, subject, text }) => {
  if (!process.env.SMTP_HOST) {
    console.log(`\n[mail not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
};
