# 🛡️ Security & Privacy

Telegram MCP is a Cloudflare Worker that enables AI assistants to send messages and voice notes via Telegram. This document explains how your data is handled and how to secure your deployment.

---

## 🔑 Key Security Features

### Your Bot, Your Worker

When you deploy Telegram MCP, it runs on **your own** Cloudflare account with **your own** Telegram bot. You control the bot token, the worker, and what chats it can access.

> **What this means:** Your Telegram bot is yours. The messages it sends, the chats it accesses—all controlled by your bot configuration and Cloudflare deployment. No shared infrastructure.

### What This MCP Can Do

| Tool | Function |
|------|----------|
| `telegram_send` | Send text messages to chats |
| `telegram_voice` | Send voice notes via text-to-speech |
| `telegram_get_me` | Retrieve bot information |
| `telegram_get_updates` | Fetch recent messages |
| `telegram_get_chat` | Get chat details |

### Token & API Key Security

All credentials must be stored as **Cloudflare environment secrets**, never in code or config files.

**Set secrets via CLI (not in wrangler.toml):**
```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ELEVENLABS_API_KEY    # optional, for voice
wrangler secret put OPENAI_API_KEY        # optional, fallback TTS
```

> **Why this matters:** Anything in `wrangler.toml` or committed code is visible in your repo history forever—even if you delete it later. Using `wrangler secret put` stores credentials encrypted in Cloudflare, completely separate from your codebase.

| Credential | Purpose |
|------------|---------|
| **Telegram Bot Token** | Authenticates your bot with Telegram |
| **ElevenLabs API Key** | Primary TTS provider (optional) |
| **OpenAI API Key** | Fallback TTS provider (optional) |

> **What this means:** Even if your code is public, your credentials are safe. Cloudflare encrypts secrets at rest and only injects them at runtime.

### No Message Storage

Telegram MCP processes messages in real-time. Messages are **not** logged, stored, or cached beyond the request lifecycle.

> **What this means:** When your bot sends a message or fetches updates, that data isn't saved anywhere on your worker. No database of conversations, no chat history beyond what Telegram itself maintains.

### Voice Note Privacy

When using `telegram_voice`, your text is sent to your configured TTS provider (ElevenLabs or OpenAI) to generate audio. The audio is then sent to Telegram.

> **What this means:** Voice generation requires a third-party TTS service. Review your TTS provider's privacy policy. The generated audio is not stored by this worker—it's sent directly to Telegram and forgotten.

---

## 🔐 Best Practices

### Enable 2FA on All Connected Accounts

| Platform | Why It Matters |
|----------|----------------|
| **Telegram** | Protects your account and BotFather access |
| **Cloudflare** | Protects your worker deployment |
| **ElevenLabs** | Protects your TTS API access (if used) |
| **OpenAI** | Protects your API access (if used) |
| **GitHub** | Protects your code if the repo is connected |

### Regenerate Compromised Tokens

**If Telegram bot token is exposed:**
1. Message @BotFather on Telegram
2. Use `/revoke` to regenerate the token
3. Update your Cloudflare environment secret

**If TTS API keys are exposed:**
1. Rotate keys in your ElevenLabs/OpenAI dashboard
2. Update Cloudflare environment secrets

### Limit Bot Scope

Only add your bot to chats where it's needed. Fewer chats = smaller attack surface.

### Monitor API Usage

Check your ElevenLabs/OpenAI dashboards periodically for unexpected usage spikes that might indicate credential theft.

---

## 🚫 What This MCP Does NOT Do

- ❌ Store messages or chat history
- ❌ Log voice note content or audio
- ❌ Share data with third parties (beyond your configured TTS provider)
- ❌ Send analytics or telemetry
- ❌ Access chats your bot isn't added to

---

## 🔍 Transparency

This project is fully open source. You can audit every line of code. There are no hidden endpoints, no telemetry, no data collection.

Your bot, your voice, your control.
