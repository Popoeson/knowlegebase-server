const https = require("https");

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Public HTTPS URL, not base64 — inline base64 images are stripped or
// blocked by render by many email clients (Outlook, some webmail), so a
// normal hosted image URL is the reliable choice for email.
const LOGO_URL = "https://www.asodem.com/asset/images/logo3.png";

const sendEmail = (to, toName, subject, htmlContent) => {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            sender: {
                email: process.env.EMAIL_USER,
                name: "ASODEM"
            },
            to: [{ email: to, name: toName }],
            subject,
            htmlContent
        });

        const options = {
            hostname: "api.brevo.com",
            path: "/v3/smtp/email",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY,
                "Content-Length": Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`Brevo API error: ${res.statusCode} — ${data}`));
                }
            });
        });

        req.on("error", reject);
        req.write(payload);
        req.end();
    });
};

const sendOTP = async (email, fullName, otp) => {
    const subject = "Verify Your Email — ASODEM";
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8F9FB;">

            <div style="text-align: center; margin-bottom: 32px;">
                <img src="${LOGO_URL}" alt="ASODEM" style="height: 36px; width: auto;">
            </div>

            <div style="background-color: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
                
                <h2 style="color: #0F172A; font-size: 20px; margin-bottom: 16px;">
                    Verify Your Email Address
                </h2>

                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                    Hi ${fullName}, welcome to ASODEM. Use the OTP below to verify your email address. It expires in 10 minutes.
                </p>

                <div style="text-align: center; margin: 32px 0;">
                    <span style="
                        display: inline-block;
                        background-color: #2563EB;
                        color: #FFFFFF;
                        font-size: 32px;
                        font-weight: 700;
                        letter-spacing: 8px;
                        padding: 16px 32px;
                        border-radius: 8px;
                    ">${otp}</span>
                </div>

                <p style="color: #94A3B8; font-size: 13px; text-align: center; margin-top: 24px;">
                    If you did not create an account, please ignore this email.
                </p>

            </div>

            <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 24px;">
                © ${new Date().getFullYear()} ASODEM. All rights reserved.
            </p>

        </div>
    `;

    await sendEmail(email, fullName, subject, htmlContent);
};

const sendPasswordResetOTP = async (email, fullName, otp) => {
    const subject = "Password Reset OTP — ASODEM";
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8F9FB;">

            <div style="text-align: center; margin-bottom: 32px;">
                <img src="${LOGO_URL}" alt="ASODEM" style="height: 36px; width: auto;">
            </div>

            <div style="background-color: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
                
                <h2 style="color: #0F172A; font-size: 20px; margin-bottom: 16px;">
                    Reset Your Password
                </h2>

                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                    Hi ${fullName}, use the OTP below to reset your password. It expires in 10 minutes.
                </p>

                <div style="text-align: center; margin: 32px 0;">
                    <span style="
                        display: inline-block;
                        background-color: #2563EB;
                        color: #FFFFFF;
                        font-size: 32px;
                        font-weight: 700;
                        letter-spacing: 8px;
                        padding: 16px 32px;
                        border-radius: 8px;
                    ">${otp}</span>
                </div>

                <p style="color: #94A3B8; font-size: 13px; text-align: center; margin-top: 24px;">
                    If you did not request a password reset, please ignore this email.
                </p>

            </div>

            <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 24px;">
                © ${new Date().getFullYear()} ASODEM. All rights reserved.
            </p>

        </div>
    `;

    await sendEmail(email, fullName, subject, htmlContent);
};

module.exports = { generateOTP, sendOTP, sendPasswordResetOTP };
