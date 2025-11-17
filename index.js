import express from 'express';
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
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;  // from Dev Portal
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;        // your n8n webhook

if (!DISCORD_PUBLIC_KEY || !N8N_WEBHOOK_URL) {
  console.error('Missing DISCORD_PUBLIC_KEY or N8N_WEBHOOK_URL env vars');
  process.exit(1);
}

// ---- Discord constants (per latest docs) ----
const InteractionType = {
  PING: 1,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
};

// Simple health check
app.get('/discord/health', (_req, res) => {
  res.status(200).send('Discord bridge OK');
});

// Signature verification helper
function isValidRequest(req) {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');

  if (!signature || !timestamp || !req.rawBody) return false;

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
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({
      type: InteractionResponseType.PONG,
    });
  }

  // 3) IMMEDIATE FINAL RESPONSE to Discord
res.status(200).json({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    content: 'Got your file, updating the doc now…',
    // 64 = ephemeral (only the command user sees it)
    flags: 64,
  },
});

  // 4) Fire-and-forget call to n8n in the background
  //    n8n will do the heavy lifting and send the final message
  //    via follow-up webhook using application_id + token.
  (async () => {
    try {
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interaction),
      });
    } catch (err) {
      console.error('Error forwarding to n8n:', err);
    }
  })();
});

app.listen(PORT, () => {
  console.log(`Discord bridge listening on port ${PORT}`);
});

