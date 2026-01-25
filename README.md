# Telegram Cloud MCP

A Cloudflare Worker that provides MCP (Model Context Protocol) integration for Telegram, enabling AI assistants to send messages and voice notes via Telegram bots.

## Features

- Send text messages to Telegram chats
- Send voice notes with text-to-speech (ElevenLabs or OpenAI)
- Get bot information
- Retrieve recent updates/messages
- Get chat information

## Tools

| Tool | Description |
|------|-------------|
| `telegram_send` | Send a text message to a chat |
| `telegram_voice` | Send a voice note (TTS) to a chat |
| `telegram_get_me` | Get bot information |
| `telegram_get_updates` | Get recent messages and updates |
| `telegram_get_chat` | Get information about a chat |

---

## Setup


### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Save the bot token you receive

---

### 2. Configure Environment Variables

Create a `.dev.vars` file for local development:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_openai_key_here        # Optional, for voice fallback
ELEVENLABS_API_KEY=your_elevenlabs_key     # Optional, for voice
ELEVENLABS_VOICE_ID=your_voice_id          # Optional, for voice
```

For production, set these as secrets in Cloudflare:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
```

---

### 3. Deploy

```bash
npm install
npm run deploy
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available tools |
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
      "url": "https://your-worker.workers.dev/sse"
    }
  }
}
```

---

## Voice Notes

Voice notes use ElevenLabs as the primary TTS provider, falling back to OpenAI if ElevenLabs is not configured or fails. If neither is configured, voice commands will return an error.

---

 ## License

MIT

---


 ## Support

  If this helped you, consider supporting my work ☕

  [![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/maii983083)

---


*Built by the Triad (Mai, Kai Stryder and Lucian Vale) for the community.*
