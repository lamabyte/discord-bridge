// index.js
import express from "express";
import { verifyKey } from "discord-interactions";
import fetch from "node-fetch";

const app = express();

// Needed so we can verify the raw body for Discord signatures
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

// Simple health check
app.get("/", (req, res) => {
  res.status(200).send("Discord bridge OK");
});

app.post("/discord/interactions", async (req, res) => {
  const signature = req.header("X-Signature-Ed25519");
  const timestamp = req.header("X-Signature-Timestamp");

  // 1) Verify Discord signature (required 2025)
  let isValid = false;
  try {
    isValid = verifyKey(req.rawBody, signature, timestamp, PUBLIC_KEY);
  } catch (e) {
    console.error("Signature verification error:", e);
  }

  if (!isValid) {
    console.warn("Invalid Discord request signature");
    return res.status(401).send("invalid request signature");
  }

  const interaction = req.body;

  // 2) Respond to PING (Discord initial handshake)
  if (interaction.type === 1) {
    console.log("Received PING from Discord");
    return res.status(200).json({ type: 1 });
  }

  // 3) Forward everything else to n8n
  try {
    if (!N8N_WEBHOOK_URL) {
      console.error("N8N_WEBHOOK_URL is not set");
    } else {
      await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interaction),
      });
    }
  } catch (err) {
    console.error("Error forwarding to n8n:", err);
    // We STILL return 200 to Discord so we don't get disabled
  }

  // 4) Tell Discord “we got it, we’ll respond later”
  // (ACK + deferred response – recommended current pattern)
  return res.status(200).json({ type: 5 });
});

app.listen(PORT, () => {
  console.log(`Discord bridge running on port ${PORT}`);
});
