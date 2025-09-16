const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user:'developer2025user@gmail.com',      // your Gmail
        pass: 'nfsv lpol topa bwly'          // 16-char app password
    }
});

transporter.sendMail({
    from: 'developer2025user@gmail.com',
    to: 'developer2025user@gmail.com',             // test sending to same account
    subject: 'Test Email',
    text: 'This is a test email from Node.js'
}, (err, info) => {
    if(err) console.log("❌ Error:", err);
    else console.log("✅ Email sent:", info.response);
});
