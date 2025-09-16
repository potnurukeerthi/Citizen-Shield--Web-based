const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ----------------------
// In-memory storage
// ----------------------
let userLocations = {}; // { username: { lat, lon, sosActive } }
let userSockets = {};   // username -> [socket.id, ...]

// ----------------------
// Update user location
// ----------------------
app.post('/update-location', (req, res) => {
    const { username, lat, lon } = req.body;
    if (!username || !lat || !lon) {
        return res.status(400).send("Missing fields");
    }

    if (!userLocations[username]) {
        userLocations[username] = { lat, lon, sosActive: false };
    } else {
        userLocations[username].lat = lat;
        userLocations[username].lon = lon;
    }

    res.send("Location updated");
});

// ----------------------
// Send SOS
// ----------------------
app.post('/send-sos', async (req, res) => {
    const { username, emergencyEmail, location } = req.body;
    if (!username || !emergencyEmail || !location) {
        return res.status(400).send('Missing fields');
    }

    if (userLocations[username]) {
        userLocations[username].sosActive = true;
    }

    // Nodemailer transporter
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: `"Citizen Shield" <${process.env.EMAIL_USER}>`,
        to: emergencyEmail,
        subject: '🚨 SOS Alert from Citizen Shield',
        text: `User ${username} is in danger!\n\nLocation: ${location}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ SOS email sent to ${emergencyEmail} for ${username}`);
    } catch (err) {
        console.error("❌ Error sending email:", err.message);
    }

    // Notify all other online users
    Object.keys(userSockets).forEach(u => {
        if (u !== username) {
            userSockets[u].forEach(socketId => {
                io.to(socketId).emit("sos-alert", { username, location });
            });
        }
    });

    res.send('SOS alert sent (email + socket notifications)');
});

// ----------------------
// Get nearby users
// ----------------------
app.get('/nearby-users', (req, res) => {
    const { username } = req.query;
    const users = Object.keys(userLocations)
        .filter(u => u !== username)
        .map(u => ({
            username: u,
            lat: userLocations[u].lat,
            lon: userLocations[u].lon,
            sosActive: userLocations[u].sosActive
        }));
    res.json(users);
});

// ----------------------
// Socket.IO events
// ----------------------
io.on("connection", socket => {
    console.log("🔗 User connected:", socket.id);

    // Register user with socket
    socket.on("register-user", username => {
        if (!userSockets[username]) userSockets[username] = [];
        if (!userSockets[username].includes(socket.id)) {
            userSockets[username].push(socket.id);
        }
        console.log(`✅ Registered user: ${username} -> sockets:`, userSockets[username]);
    });

   // Helper accepts SOS
socket.on("accept-sos", ({ saver, victim }) => {
    if (userLocations[victim] && userSockets[saver]) {
        // Notify helper with victim location
        userSockets[saver].forEach(socketId => {
            io.to(socketId).emit("sos-accepted", {
                saver,
                victim,
                location: userLocations[victim]
            });
        });

        // Notify victim that someone accepted
        if (userSockets[victim]) {
            userSockets[victim].forEach(socketId => {
                io.to(socketId).emit("helper-accepted", { saver });
            });
        }

        // ✅ Reset victim's SOS (so future runs work again)
        userLocations[victim].sosActive = false;

        console.log(`${saver} accepted SOS of ${victim}. SOS reset.`);
    }
});

// Helper declines SOS
socket.on("decline-sos", ({ saver, victim }) => {
    console.log(`${saver} declined SOS request from ${victim}`);

    // Optionally reset if you want SOS to be reusable after decline
    // userLocations[victim].sosActive = false;
});



    // Disconnect
    socket.on("disconnect", () => {
        for (let u in userSockets) {
            const index = userSockets[u].indexOf(socket.id);
            if (index !== -1) {
                userSockets[u].splice(index, 1);
                if (userSockets[u].length === 0) delete userSockets[u];
                console.log(`❌ User disconnected: ${u} (socket ${socket.id})`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
