const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = "2264c757b0ebb535c5ad103ce540ed69";
const DB_FILE = "anonymousbox_db.json";

/* ---------------- DB HELPERS ---------------- */

async function dbRead() {
  const res = await axios.get(
    `https://api.github.com/gists/${GIST_ID}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  const file = res.data.files[DB_FILE];

  if (!file || !file.content) {
    return { users: [], messages: [] };
  }

  try {
    const parsed = JSON.parse(file.content);
    return {
      users: parsed.users || [],
      messages: parsed.messages || [],
    };
  } catch {
    return { users: [], messages: [] };
  }
}

async function dbWrite(data) {
  await axios.patch(
    `https://api.github.com/gists/${GIST_ID}`,
    {
      files: {
        [DB_FILE]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
}

/* ---------------- AUTH ---------------- */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    const db = await dbRead();

    if (db.users.find((u) => u.username === username)) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    db.users.push({
      username,
      password: hashed,
      createdAt: new Date().toISOString(),
    });

    await dbWrite(db);

    res.json({
      token: username,
      user: { username },
    });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    const db = await dbRead();
    const user = db.users.find((u) => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      token: username,
      user: { username },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

/* ---------------- MESSAGES ---------------- */

app.post("/api/messages/:username", async (req, res) => {
  try {
    const { content, category } = req.body;
    const recipient = req.params.username;

    if (!content)
      return res.status(400).json({ error: "Empty message" });

    const db = await dbRead();

    db.messages.push({
      _id: Date.now().toString(),
      recipient,
      content,
      category: category || "Anonymous",
      createdAt: new Date().toISOString(),
    });

    await dbWrite(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Could not send message" });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const username = req.headers.authorization;
    if (!username)
      return res.status(401).json({ error: "Unauthorized" });

    const db = await dbRead();

    const myMessages = db.messages
      .filter((m) => m.recipient === username)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(myMessages);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

/* ---------------- EXPORT ---------------- */

module.exports = app;
