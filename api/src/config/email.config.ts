export default () => ({
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    replyToEmail: process.env.RESEND_REPLY_TO_EMAIL,
  },
});
