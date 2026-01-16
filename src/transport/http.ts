import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';
import { getConfig } from '../config.js';

// Store active sessions
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

/**
 * Handle MCP requests at /mcp endpoint
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  createServerFn: () => Server
): Promise<void> {
  // Parse session ID from query string
  const url = new URL(req.url!, `http://${req.headers.host}`);
  let sessionId = url.searchParams.get('sessionId');

  // For new sessions (POST without session ID), create a new session
  if (req.method === 'POST' && !sessionId) {
    sessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId!,
    });
    const server = createServerFn();

    sessions.set(sessionId, { transport, server });

    // Handle session close
    transport.onclose = () => {
      sessions.delete(sessionId!);
    };

    await server.connect(transport);
  }

  // Get existing session or use the newly created one
  const session = sessions.get(sessionId!);
  if (!session) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
    return;
  }

  // Handle the request with raw Node.js objects (no third argument)
  await session.transport.handleRequest(req, res);
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', transport: 'http' }));
}

/**
 * Handle 404 not found
 */
function handleNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Start MCP server with HTTP transport using raw Node.js HTTP
 */
export async function startHttpTransport(createServerFn: () => Server): Promise<void> {
  const config = getConfig();

  const httpServer = createHttpServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    switch (url.pathname) {
      case '/mcp':
        await handleMcpRequest(req, res, createServerFn);
        break;
      case '/health':
        handleHealthCheck(res);
        break;
      default:
        handleNotFound(res);
    }
  });

  httpServer.listen(config.httpPort, () => {
    console.error(`OSM Tools MCP Server listening on http://localhost:${config.httpPort}`);
    console.error(`MCP endpoint: http://localhost:${config.httpPort}/mcp`);
    console.error(`Health endpoint: http://localhost:${config.httpPort}/health`);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down...');

    // Close all sessions
    for (const [sessionId, session] of sessions) {
      await session.server.close();
      sessions.delete(sessionId);
    }

    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
