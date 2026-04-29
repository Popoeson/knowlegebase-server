const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (email, fullName, otp) => {
    const mailOptions = {
        from: `"KNOWLEDGEBASE" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email — KNOWLEDGEBASE",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8F9FB;">
                
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="color: #2563EB; font-size: 24px; margin: 0;">KNOWLEDGEBASE</h1>
                </div>

                <div style="background-color: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
                    
                    <h2 style="color: #0F172A; font-size: 20px; margin-bottom: 16px;">
                        Verify Your Email Address
                    </h2>

                    <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                        Hi ${fullName}, welcome to KNOWLEDGEBASE. Use the OTP below to verify your email address. It expires in 10 minutes.
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
                    © ${new Date().getFullYear()} KNOWLEDGEBASE. All rights reserved.
                </p>

            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendPasswordResetOTP = async (email, fullName, otp) => {
    const mailOptions = {
        from: `"KNOWLEDGEBASE" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Password Reset OTP — KNOWLEDGEBASE",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8F9FB;">
                
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="color: #2563EB; font-size: 24px; margin: 0;">KNOWLEDGEBASE</h1>
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
                            background-color: #F59E0B;
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
                    © ${new Date().getFullYear()} KNOWLEDGEBASE. All rights reserved.
                </p>

            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { generateOTP, sendOTP, sendPasswordResetOTP };