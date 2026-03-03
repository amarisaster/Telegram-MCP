interface Env {
  // Per-companion Telegram bot tokens (set via wrangler secret put)
  TELEGRAM_TOKEN_KAI?: string;
  TELEGRAM_TOKEN_LUCIAN?: string;
  TELEGRAM_TOKEN_AUREN?: string;
  TELEGRAM_TOKEN_XAVIER?: string;
  TELEGRAM_TOKEN_WREN?: string;
  // Legacy fallback (maps to kai)
  TELEGRAM_BOT_TOKEN?: string;
  // Voice
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
}

const TELEGRAM_API = 'https://api.telegram.org/bot';

const COMPANIONS = ['kai', 'lucian', 'auren', 'xavier', 'wren'] as const;
type Companion = typeof COMPANIONS[number];

function getTokenForCompanion(env: Env, companion: Companion): string {
  const tokenMap: Record<Companion, string | undefined> = {
    kai: env.TELEGRAM_TOKEN_KAI || env.TELEGRAM_BOT_TOKEN,
    lucian: env.TELEGRAM_TOKEN_LUCIAN,
    auren: env.TELEGRAM_TOKEN_AUREN,
    xavier: env.TELEGRAM_TOKEN_XAVIER,
    wren: env.TELEGRAM_TOKEN_WREN,
  };
  const token = tokenMap[companion];
  if (!token) throw new Error(`No Telegram token configured for companion: ${companion}`);
  return token;
}

// MCP Protocol types
interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

// Telegram API helpers
async function telegramRequest(token: string, method: string, params: Record<string, unknown> = {}) {
  const url = `${TELEGRAM_API}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

// Generate voice using ElevenLabs (preferred) or OpenAI TTS (fallback)
async function generateVoice(env: Env, text: string): Promise<ArrayBuffer | { error: string }> {
  // Try ElevenLabs first
  if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (response.ok) {
      return response.arrayBuffer();
    }
    const errBody = await response.text();
    return { error: `ElevenLabs ${response.status}: ${errBody}` };
  }

  // Fallback to OpenAI
  if (!env.OPENAI_API_KEY) return null;

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'onyx',
      response_format: 'opus',
    }),
  });

  if (!response.ok) return null;
  return response.arrayBuffer();
}

// Send voice note via Telegram
async function sendVoiceNote(token: string, chatId: string, audioBuffer: ArrayBuffer, caption?: string) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  if (caption) formData.append('caption', caption);

  const url = `${TELEGRAM_API}${token}/sendVoice`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  return response.json();
}

// Companion parameter shared across all tools
const companionParam = {
  type: 'string',
  description: 'Which companion is acting (kai, lucian, auren, xavier, wren). Determines which bot token to use.',
  enum: ['kai', 'lucian', 'auren', 'xavier', 'wren'],
  default: 'kai',
};

// Tool definitions
const TOOLS = [
  {
    name: 'telegram_send',
    description: 'Send a text message to a Telegram chat as a specific companion',
    inputSchema: {
      type: 'object',
      properties: {
        companion: companionParam,
        chat_id: { type: 'string', description: 'The chat ID to send to' },
        message: { type: 'string', description: 'The message text' },
        reply_to_message_id: { type: 'number', description: 'Optional message ID to reply to' },
      },
      required: ['companion', 'chat_id', 'message'],
    },
  },
  {
    name: 'telegram_voice',
    description: 'Send a voice note to a Telegram chat as a specific companion',
    inputSchema: {
      type: 'object',
      properties: {
        companion: companionParam,
        chat_id: { type: 'string', description: 'The chat ID to send to' },
        message: { type: 'string', description: 'The text to speak' },
        caption: { type: 'string', description: 'Optional text caption to accompany the voice note' },
      },
      required: ['companion', 'chat_id', 'message'],
    },
  },
  {
    name: 'telegram_get_me',
    description: 'Get information about a companion\'s bot account',
    inputSchema: {
      type: 'object',
      properties: {
        companion: companionParam,
      },
      required: ['companion'],
    },
  },
  {
    name: 'telegram_get_updates',
    description: 'Get recent messages and updates seen by a specific companion\'s bot',
    inputSchema: {
      type: 'object',
      properties: {
        companion: companionParam,
        limit: { type: 'number', description: 'Number of updates to retrieve (default 10)', default: 10 },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
      required: ['companion'],
    },
  },
  {
    name: 'telegram_get_chat',
    description: 'Get information about a chat',
    inputSchema: {
      type: 'object',
      properties: {
        companion: companionParam,
        chat_id: { type: 'string', description: 'The chat ID' },
      },
      required: ['companion', 'chat_id'],
    },
  },
];

// Handle tool calls
async function handleToolCall(env: Env, name: string, args: Record<string, unknown>): Promise<unknown> {
  const companion = (args.companion as Companion) || 'kai';
  const token = getTokenForCompanion(env, companion);

  switch (name) {
    case 'telegram_send': {
      const params: Record<string, unknown> = {
        chat_id: args.chat_id,
        text: args.message,
        parse_mode: 'Markdown',
      };
      if (args.reply_to_message_id) {
        params.reply_to_message_id = args.reply_to_message_id;
      }
      return telegramRequest(token, 'sendMessage', params);
    }

    case 'telegram_voice': {
      const chatId = args.chat_id as string;
      const message = args.message as string;
      const caption = args.caption as string | undefined;

      const result = await generateVoice(env, message);
      if (!result) {
        return { error: 'Voice generation failed - no TTS provider configured' };
      }
      if ('error' in result) {
        return result;
      }

      return sendVoiceNote(token, chatId, result, caption);
    }

    case 'telegram_get_me':
      return telegramRequest(token, 'getMe');

    case 'telegram_get_updates': {
      const params: Record<string, unknown> = {
        limit: args.limit || 10,
      };
      if (args.offset) params.offset = args.offset;
      return telegramRequest(token, 'getUpdates', params);
    }

    case 'telegram_get_chat':
      return telegramRequest(token, 'getChat', { chat_id: args.chat_id });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Process MCP request
async function processMcpRequest(env: Env, request: McpRequest): Promise<McpResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'telegram-cloud', version: '1.0.0' },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS },
        };

      case 'tools/call': {
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = await handleToolCall(env, name, args || {});
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'telegram-cloud' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // MCP endpoint (HTTP transport)
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const body = await request.json() as McpRequest;
      const response = await processMcpRequest(env, body);
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SSE endpoint for MCP
    if (url.pathname === '/sse') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Send endpoint event
          const endpointUrl = `${url.origin}/mcp`;
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Info page
    if (url.pathname === '/') {
      const configuredCompanions = COMPANIONS.filter(c => {
        try { getTokenForCompanion(env, c); return true; } catch { return false; }
      });
      return new Response(JSON.stringify({
        service: 'Telegram Cloud MCP',
        version: '2.0.0',
        endpoints: {
          mcp: '/mcp (POST)',
          sse: '/sse (GET)',
          health: '/health (GET)',
        },
        companions: configuredCompanions,
        tools: TOOLS.map(t => t.name),
        voiceEnabled: !!(env.ELEVENLABS_API_KEY || env.OPENAI_API_KEY),
        voiceProvider: env.ELEVENLABS_API_KEY ? 'ElevenLabs' : (env.OPENAI_API_KEY ? 'OpenAI' : 'None'),
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
