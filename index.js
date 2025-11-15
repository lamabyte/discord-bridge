const express = require('express');
const bodyParser = require('body-parser');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { verifyKey } = require('discord-interactions');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3000;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!DISCORD_PUBLIC_KEY || !N8N_WEBHOOK_URL) {
  console.error(
    'ERROR: Missing DISCORD_PUBLIC_KEY or N8N_WEBHOOK_URL in environment variables.'
  );
  process.exit(1);
}

// we need the raw body for signature verification
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.post('/discord/interactions', async (req, res) => {
  try {
    const sig = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');

    if (!sig || !timestamp || !req.rawBody) {
      console.warn('Missing signature headers');
      return res.status(401).send('missing signature headers');
    }

    const isValid = verifyKey(
      req.rawBody,
      sig,
      timestamp,
      DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      console.warn('Invalid request signature');
      return res.status(401).send('invalid request signature');
    }

    const interaction = req.body;

    // PING -> respond with PONG
    if (interaction.type === 1) {
      return res.json({ type: 1 });
    }

    // Forward interaction to n8n webhook
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(interaction),
    });

    // Immediate ACK so Discord doesn't time out
    return res.json({
      type: 4,
      data: {
        content: '✅ Got it! Processing in n8n…',
      },
    });
  } catch (err) {
    console.error('Error in /discord/interactions', err);
    return res.status(500).send('server error');
  }
});

app.listen(PORT, () => {
  console.log(`Discord bridge running on port ${PORT}`);
});
