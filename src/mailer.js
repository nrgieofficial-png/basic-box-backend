// Google Apps Script Proxy — 100% free, sends directly from your Gmail, never goes to spam!
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyuawgO_U-rrGcOl0jkFKG7R3-UQIlYpvK4vowDDFuvawKzPKC2om_h86MPmcZgHLd2pA/exec';

export const sendOTP = async (toEmail, otpCode) => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #047857 0%, #065f46 100%); padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: 1px;">📦 Basics Box</h1>
        <p style="margin: 8px 0 0; color: #a7f3d0; font-size: 14px;">Madagadipet Quick Commerce</p>
      </div>

      <!-- Body -->
      <div style="padding: 35px 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 20px;">Hello there! 👋</h2>
        
        <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 12px;">
          Thank you for choosing <strong>Basics Box</strong> — your trusted quick commerce partner in Madagadipet.
        </p>
        <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 12px;">
          We received a request to verify your identity. To complete your login, please use the One-Time Password below.
        </p>
        <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 12px;">
          This code is valid for <strong>10 minutes</strong> and can only be used once for your security.
        </p>

        <!-- OTP Box -->
        <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 2px solid #10b981; border-radius: 16px; padding: 25px; text-align: center; margin: 30px 0;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #047857; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">Your Verification Code</p>
          <h1 style="margin: 0; color: #064e3b; font-size: 42px; letter-spacing: 10px; font-weight: 800;">${otpCode}</h1>
        </div>

        <p style="font-size: 15px; color: #475569; line-height: 1.7; margin: 0 0 12px;">
          If you did not request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
        </p>
        <p style="font-size: 15px; color: #475569; line-height: 1.7; margin: 0 0 0;">
          We're excited to have you on board! Explore the best deals and fastest deliveries right at your doorstep. 🚀
        </p>

        <!-- Footer -->
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0 20px;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          © ${new Date().getFullYear()} Basics Box · Madagadipet Quick Commerce<br/>
          This is an automated message. Please do not reply.
        </p>
      </div>
    </div>
  `;

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: toEmail,
        subject: `Basics Box — Your OTP is ${otpCode}`,
        htmlBody: htmlContent
      })
    });

    const data = await response.json();
    if (data.success) {
      console.log(`[MAILER] ✅ GAS OTP sent to ${toEmail}`);
    } else {
      console.error('[MAILER] ❌ GAS API error:', data.error);
    }
    return data;
  } catch (err) {
    console.error(`[MAILER] ❌ Failed to send OTP via GAS to ${toEmail}:`, err.message);
  }
};
