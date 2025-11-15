# Discord Bridge

Small Express app that verifies Discord interaction signatures and forwards
valid interactions to an n8n webhook.

## Env variables

- `DISCORD_PUBLIC_KEY` – from Discord Developer Portal (General Information)
- `N8N_WEBHOOK_URL` – your n8n webhook URL (e.g. `https://n8n.lamabyte.systems/webhook/discord-interactions`)
- `PORT` – default `3000`
