import express from 'express';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import bodyParser from 'body-parser';

const app = express();

// We need raw body for signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

const PORT = process.env.PORT || 3000;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;   // from Dev Portal
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;         // your n8n webhook

if (!DISCORD_PUBLIC_KEY || !N8N_WEBHOOK_URL) {
  console.error('Missing DISCORD_PUBLIC_KEY or N8N_WEBHOOK_URL env vars');
  process.exit(1);
}

// Simple health check
app.get('/discord/health', (req, res) => {
  res.status(200).send('Discord bridge OK');
});

// Signature verification helper
function isValidRequest(req) {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');

  if (!signature || !timestamp) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'utf8'),
    Buffer.from(req.rawBody),
  ]);

  const sig = Buffer.from(signature, 'hex');
  const key = Buffer.from(DISCORD_PUBLIC_KEY, 'hex');

  return nacl.sign.detached.verify(message, sig, key);
}

app.post('/discord/interactions', async (req, res) => {
  // 1) Verify Discord signature
  if (!isValidRequest(req)) {
    console.warn('Invalid Discord signature');
    return res.status(401).send('invalid request signature');
  }

  const interaction = req.body;

  // 2) Handle PING (type 1) directly
  if (interaction.type === 1) {
    // PONG
    return res.status(200).json({ type: 1 });
  }

  // 3) Forward everything else to n8n
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(interaction),
    });

    const text = await response.text();

    // If your n8n flow returns Discord-style JSON responses, you can:
    // - forward them directly, or
    // - just ACK here and let n8n handle follow-up messages via webhooks

    if (response.headers.get('content-type')?.includes('application/json')) {
      return res.status(response.status).type('application/json').send(text);
    } else {
      // Basic ACK so Discord doesn't time out (n8n can use follow-up webhooks)
      return res.status(200).json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    }
  } catch (err) {
    console.error('Error forwarding to n8n:', err);
    return res.status(500).send('error forwarding to n8n');
  }
});

app.listen(PORT, () => {
  console.log(`Discord bridge listening on port ${PORT}`);
});
