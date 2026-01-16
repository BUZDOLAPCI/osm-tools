import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server as HttpServer } from 'http';
import { createMcpHttpServer } from '../../src/transport/http.js';
import { createServer } from '../../src/server.js';
import { setConfig } from '../../src/config.js';

// Store the original fetch to use for HTTP tests
const originalFetch = global.fetch;

describe('HTTP Transport /mcp endpoint', () => {
  let httpServer: HttpServer;
  let serverAddress: { port: number; address: string };

  beforeAll(async () => {
    // Restore original fetch for HTTP tests
    global.fetch = originalFetch;
    setConfig({ throttleMs: 0 });

    // Create and start server on random port
    httpServer = createMcpHttpServer(createServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
          serverAddress = { port: addr.port, address: addr.address };
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('should respond to health check endpoint', async () => {
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/health`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'ok', transport: 'http' });
  });

  it('should return 404 for unknown endpoints', async () => {
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/unknown`);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Not found' });
  });

  it('should handle MCP initialize request at /mcp endpoint and return tools', async () => {
    // Step 1: Initialize the MCP session
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(initRequest)
    });

    expect(initResponse.status).toBe(200);

    // Parse session ID from response header
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Parse the initialize response
    const initText = await initResponse.text();
    const initLines = initText.split('\n');
    let initResult = null;
    for (const line of initLines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result && data.result.serverInfo) {
            initResult = data;
            break;
          }
        } catch {
          // Skip
        }
      }
    }

    // Verify we got a valid initialize response
    expect(initResult).not.toBeNull();
    expect(initResult.jsonrpc).toBe('2.0');
    expect(initResult.id).toBe(1);
    expect(initResult.result).toBeDefined();
    expect(initResult.result.serverInfo).toBeDefined();
    expect(initResult.result.serverInfo.name).toBe('osm-tools');
    expect(initResult.result.serverInfo.version).toBe('1.0.0');

    // Verify capabilities include tools
    expect(initResult.result.capabilities).toBeDefined();
    expect(initResult.result.capabilities.tools).toBeDefined();
  });

  it('should return 400 for GET request without session ID', async () => {
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid or missing session ID');
  });

  it('should expose /mcp endpoint that accepts POST requests', async () => {
    // Verify the /mcp endpoint is accessible
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 999,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });

    // Should not return 404 or 405
    expect(response.status).toBe(200);

    // Should return session ID header
    const sessionId = response.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
    expect(sessionId!.length).toBeGreaterThan(0);
  });
});
