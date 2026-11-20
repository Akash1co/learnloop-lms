const nodemailer = require('nodemailer');

const sentMessages = [];
let transporter;

function hasSmtpCredentials() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  const mock = process.env.NODE_ENV === 'test' || !hasSmtpCredentials();
  const message = {
    from: process.env.EMAIL_FROM || 'LearnLoop <no-reply@learnloop.local>',
    to,
    subject,
    text,
  };
  if (!mock) await getTransporter().sendMail(message);
  const log = { ...message, transport: mock ? 'mock' : 'smtp', sent_at: new Date().toISOString() };
  sentMessages.push(log);
  return log;
}

function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: 'Welcome to LearnLoop',
    text: `Welcome to LearnLoop, ${user.name}! Your account is ready.`,
  });
}

function sendEnrollmentEmail(user, course) {
  return sendEmail({
    to: user.email,
    subject: `Enrollment confirmed: ${course.title}`,
    text: `You are enrolled in ${course.title}. Start learning whenever you are ready.`,
  });
}

function sendGradeEmail(submission) {
  return sendEmail({
    to: submission.student_email,
    subject: 'Your assignment has been graded',
    text: `Your submission received a grade of ${submission.grade}.${submission.feedback ? ` Feedback: ${submission.feedback}` : ''}`,
  });
}

function getSentMessages() {
  return sentMessages.map((message) => ({ ...message }));
}

function resetSentMessages() {
  sentMessages.length = 0;
  transporter = undefined;
}

module.exports = {
  getSentMessages, resetSentMessages, sendEnrollmentEmail, sendGradeEmail, sendWelcomeEmail,
};
