const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  const { data, error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject,
    html,
  });

  console.log("DATA:", data);
  console.log("ERROR:", error);

  if (error) throw new Error(error.message);

  return data;
};

module.exports = sendEmail;