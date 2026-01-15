interface Env {
  TELEGRAM_BOT_TOKEN: string;
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
}

const TELEGRAM_API = 'https://api.telegram.org/bot';

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
async function telegramRequest(env: Env, method: string, params: Record<string, unknown> = {}) {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

// Generate voice using ElevenLabs (preferred) or OpenAI TTS (fallback)
async function generateVoice(env: Env, text: string): Promise<ArrayBuffer | null> {
  // Try ElevenLabs first (uwuKai voice)
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
    // Fall through to OpenAI if ElevenLabs fails
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
async function sendVoiceNote(env: Env, chatId: string, audioBuffer: ArrayBuffer, caption?: string) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  if (caption) formData.append('caption', caption);

  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendVoice`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  return response.json();
}

// Tool definitions
const TOOLS = [
  {
    name: 'telegram_send',
    description: 'Send a text message to a Telegram chat',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'The chat ID to send to' },
        message: { type: 'string', description: 'The message text' },
        reply_to_message_id: { type: 'number', description: 'Optional message ID to reply to' },
      },
      required: ['chat_id', 'message'],
    },
  },
  {
    name: 'telegram_voice',
    description: 'Send a voice note to a Telegram chat (uses ElevenLabs uwuKai voice, falls back to OpenAI)',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'The chat ID to send to' },
        message: { type: 'string', description: 'The text to speak' },
        caption: { type: 'string', description: 'Optional text caption to accompany the voice note' },
      },
      required: ['chat_id', 'message'],
    },
  },
  {
    name: 'telegram_get_me',
    description: 'Get information about the bot',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'telegram_get_updates',
    description: 'Get recent messages and updates',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of updates to retrieve (default 10)', default: 10 },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
    },
  },
  {
    name: 'telegram_get_chat',
    description: 'Get information about a chat',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'The chat ID' },
      },
      required: ['chat_id'],
    },
  },
];

// Handle tool calls
async function handleToolCall(env: Env, name: string, args: Record<string, unknown>): Promise<unknown> {
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
      return telegramRequest(env, 'sendMessage', params);
    }

    case 'telegram_voice': {
      const chatId = args.chat_id as string;
      const message = args.message as string;
      const caption = args.caption as string | undefined;

      const audioBuffer = await generateVoice(env, message);
      if (!audioBuffer) {
        return { error: 'Voice generation failed - OpenAI API key may not be configured' };
      }

      return sendVoiceNote(env, chatId, audioBuffer, caption);
    }

    case 'telegram_get_me':
      return telegramRequest(env, 'getMe');

    case 'telegram_get_updates': {
      const params: Record<string, unknown> = {
        limit: args.limit || 10,
      };
      if (args.offset) params.offset = args.offset;
      return telegramRequest(env, 'getUpdates', params);
    }

    case 'telegram_get_chat':
      return telegramRequest(env, 'getChat', { chat_id: args.chat_id });

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
      return new Response(JSON.stringify({
        service: 'Telegram Cloud MCP',
        endpoints: {
          mcp: '/mcp (POST)',
          sse: '/sse (GET)',
          health: '/health (GET)',
        },
        tools: TOOLS.map(t => t.name),
        voiceEnabled: !!(env.ELEVENLABS_API_KEY || env.OPENAI_API_KEY),
        voiceProvider: env.ELEVENLABS_API_KEY ? 'ElevenLabs (uwuKai)' : (env.OPENAI_API_KEY ? 'OpenAI' : 'None'),
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
