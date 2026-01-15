import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express, { Request, Response } from 'express';
import { getConfig } from '../config.js';

/**
 * Start MCP server with HTTP/SSE transport
 */
export async function startHttpTransport(server: Server): Promise<void> {
  const config = getConfig();
  const app = express();

  app.use(express.json());

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint for MCP communication
  app.get('/sse', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string || crypto.randomUUID();

    const transport = new SSEServerTransport('/messages', res);
    transports.set(sessionId, transport);

    res.on('close', () => {
      transports.delete(sessionId);
    });

    await server.connect(transport);
  });

  // POST endpoint for client messages
  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const transport = transports.get(sessionId)!;

    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', transport: 'http' });
  });

  // Start HTTP server
  const httpServer = app.listen(config.httpPort, () => {
    console.error(`OSM Tools MCP Server listening on http://localhost:${config.httpPort}`);
    console.error(`SSE endpoint: http://localhost:${config.httpPort}/sse`);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down...');
    httpServer.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
