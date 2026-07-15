import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'drcheckflippy@gmail.com',
    pass: 'wmxe fkes whim srfs'
  }
});

export const sendOTP = async (toEmail, otpCode) => {
  const mailOptions = {
    from: '"Basic Box Auth" <drcheckflippy@gmail.com>',
    to: toEmail,
    subject: 'Your Basic Box Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2 style="color: #047857; text-align: center;">Welcome to Basic Box</h2>
        <p style="font-size: 16px; color: #334155;">Hello,</p>
        <p style="font-size: 16px; color: #334155;">Your One-Time Password (OTP) for login/registration is:</p>
        <div style="background-color: #ecfdf5; border: 2px dashed #10b981; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <h1 style="margin: 0; color: #064e3b; letter-spacing: 4px;">${otpCode}</h1>
        </div>
        <p style="font-size: 14px; color: #64748b;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Basic Box - Madagadipet Quick Commerce</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`Failed to send OTP to ${toEmail}:`, error);
    return false;
  }
};
