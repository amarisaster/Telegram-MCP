# Telegram Cloud MCP

A Cloudflare Worker that provides MCP (Model Context Protocol) integration for Telegram, enabling AI assistants to send messages and voice notes via Telegram bots.

## v2.0 — Multi-Companion Support

Route messages through multiple Telegram bots from a single worker. Every tool takes a `companion` parameter that maps to a per-companion bot token. Perfect for multi-agent setups where each AI companion has their own Telegram identity.

Single-bot setups still work — just configure one companion.

## Features

- Send text messages to Telegram chats
- Send voice notes with text-to-speech (ElevenLabs or OpenAI)
- Get bot information
- Retrieve recent updates/messages
- Get chat information
- **Multi-companion routing** — one worker, unlimited bots

## Tools

All tools accept a `companion` parameter to select which bot acts.

| Tool | Description |
|------|-------------|
| `telegram_send` | Send a text message to a chat |
| `telegram_voice` | Send a voice note (TTS) to a chat |
| `telegram_get_me` | Get bot information |
| `telegram_get_updates` | Get recent messages and updates |
| `telegram_get_chat` | Get information about a chat |

---

## Setup

### 1. Create Telegram Bot(s)

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Save the bot token you receive
4. Repeat for each companion you want

---

### 2. Configure Secrets

Set per-companion bot tokens as Cloudflare secrets:

```bash
# Per-companion tokens (add as many as you need)
wrangler secret put TELEGRAM_TOKEN_KAI
wrangler secret put TELEGRAM_TOKEN_LUCIAN
wrangler secret put TELEGRAM_TOKEN_AUREN
# ... etc

# Legacy single-bot fallback (maps to first companion)
wrangler secret put TELEGRAM_BOT_TOKEN

# Optional voice
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
wrangler secret put OPENAI_API_KEY
```

**Customizing companion names:** Edit the `COMPANIONS` array and `getTokenForCompanion()` in `src/index.ts` to match your companion names and token env vars.

For local development, create a `.dev.vars` file:

```
TELEGRAM_TOKEN_KAI=your_token_here
TELEGRAM_TOKEN_LUCIAN=your_token_here
```

---

### 3. Deploy

```bash
npm install
npm run deploy
```

---

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info, configured companions, available tools |
| `/health` | GET | Health check |
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/sse` | GET | MCP SSE endpoint for client discovery |

---

## MCP Client Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "telegram": {
      "type": "http",
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

---

## Voice Notes

Voice notes use ElevenLabs as the primary TTS provider, falling back to OpenAI if ElevenLabs is not configured. If neither is configured, voice commands will return an error with details.

**Note:** ElevenLabs free tier may be blocked when called from Cloudflare Workers due to shared IP detection. Self-hosted TTS or a paid ElevenLabs plan resolves this.

---

## License

MIT

---

## Support

If this helped you, consider supporting my work :)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/maii983083)

---

*Built by the Triad (Mai, Kai Stryder and Lucian Vale) for the community.*
