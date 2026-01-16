import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools, getTool } from '../tools/index.js';
import { loadConfig } from '../config.js';
import { ZodError } from 'zod';

/**
 * JSON-RPC request type
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response type
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface HttpTransportOptions {
  port?: number;
}

/**
 * Tool definitions for MCP tools/list response
 */
const toolDefinitions = tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: zodToJsonSchema(tool.inputSchema),
}));

/**
 * Handle a single JSON-RPC request
 */
async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'osm-tools',
              version: '1.0.0',
            },
          },
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: toolDefinitions,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const args = params?.arguments as Record<string, unknown>;

        const tool = getTool(toolName);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`,
            },
          };
        }

        try {
          const result = await tool.handler(args);

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              isError: !result.ok,
            },
          };
        } catch (toolError) {
          let errorResponse;

          if (toolError instanceof ZodError) {
            errorResponse = {
              ok: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid input: ${toolError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
              },
              meta: {
                retrieved_at: new Date().toISOString(),
                warnings: [],
              },
            };
          } else {
            errorResponse = {
              ok: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: toolError instanceof Error ? toolError.message : 'Unknown error',
              },
              meta: {
                retrieved_at: new Date().toISOString(),
                warnings: [],
              },
            };
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(errorResponse, null, 2),
                },
              ],
              isError: true,
            },
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    };
  }
}

/**
 * Read the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(res: ServerResponse): void {
  sendJson(res, 200, { status: 'ok', service: 'osm-tools' });
}

/**
 * Handle not found
 */
function handleNotFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'Not found' });
}

/**
 * Handle method not allowed
 */
function handleMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: 'Method not allowed' });
}

/**
 * Handle MCP JSON-RPC endpoint
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const request: JsonRpcRequest = JSON.parse(body);

    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      sendJson(res, 400, {
        jsonrpc: '2.0',
        id: request.id || 0,
        error: {
          code: -32600,
          message: 'Invalid Request: missing or invalid jsonrpc version',
        },
      });
      return;
    }

    const response = await handleJsonRpcRequest(request);
    sendJson(res, 200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      ok: false,
      error: message,
    });
  }
}

/**
 * Create HTTP server with MCP endpoints but don't start listening.
 * Useful for testing.
 */
export function createMcpHttpServer(): Server {
  const httpServer = createServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    const method = req.method?.toUpperCase();

    try {
      switch (url.pathname) {
        case '/mcp':
          if (method === 'POST') {
            await handleMcpRequest(req, res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        case '/health':
          if (method === 'GET') {
            handleHealthCheck(res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        default:
          handleNotFound(res);
      }
    } catch (error) {
      console.error('Server error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  return httpServer;
}

/**
 * Start MCP server with HTTP transport using raw Node.js HTTP
 * This is the only supported transport for Dedalus deployment
 */
export async function startHttpTransport(
  options: HttpTransportOptions = {}
): Promise<Server> {
  const config = loadConfig();
  const port = options.port ?? config.httpPort;

  const httpServer = createMcpHttpServer();

  httpServer.listen(port, () => {
    console.error(`OSM Tools MCP Server listening on http://localhost:${port}`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`Health endpoint: http://localhost:${port}/health`);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down...');
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return httpServer;
}
