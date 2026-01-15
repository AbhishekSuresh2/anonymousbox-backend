const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_TOKEN = "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";
const GIST_ID = "2264c757b0ebb535c5ad103ce540ed69";

// Helper: Get data from Gist
async function dbRead() {
    const res = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    return JSON.parse(res.data.files["anonymousbox_db.json"].content);
}

// Helper: Save data to Gist
async function dbWrite(data) {
    await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
        files: {
            "anonymousbox_db.json": { content: JSON.stringify(data, null, 2) }
        }
    }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
}

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = await dbRead();
        
        if (db.users.find(u => u.username === username)) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        db.users.push({ username, password: hashedPassword });
        await dbWrite(db);

        // We just return the username as the "token"
        res.json({ token: username, user: { username } });
    } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = await dbRead();
        const user = db.users.find(u => u.username === username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        res.json({ token: username, user: { username } });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

// --- Message Routes ---

app.post('/api/messages/:username', async (req, res) => {
    try {
        const { content, category } = req.body;
        const recipient = req.params.username;
        const db = await dbRead();

        db.messages.push({
            _id: Date.now().toString(),
            recipient,
            content,
            category,
            createdAt: new Date().toISOString()
        });

        await dbWrite(db);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Could not send" }); }
});

app.get('/api/messages', async (req, res) => {
    try {
        // The "token" is just the username sent from frontend
        const username = req.headers.authorization; 
        if (!username) return res.status(401).send("No user provided");

        const db = await dbRead();
        const myMessages = db.messages.filter(m => m.recipient === username);
        res.json(myMessages.reverse());
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

module.exports = app;
