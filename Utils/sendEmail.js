const { Resend } = require("resend");

let resend;
const getResendClient = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_dev_key");
  }
  return resend;
};

const sendEmail = async ({ to, subject, html }) => {
  const client = getResendClient();
  const { data, error } = await client.emails.send({
    from: "noreply@rohitdevstack.online",
    to,
    subject,
    html,
  });

  if (error) throw new Error(error.message);

  return data;
};

module.exports = sendEmail;
