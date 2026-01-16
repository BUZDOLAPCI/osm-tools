import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server as HttpServer } from 'http';
import { createMcpHttpServer } from '../../src/transport/http.js';
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
    httpServer = createMcpHttpServer();

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
    expect(body).toEqual({ status: 'ok', service: 'osm-tools' });
  });

  it('should return 404 for unknown endpoints', async () => {
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/unknown`);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Not found' });
  });

  it('should handle MCP initialize request at /mcp endpoint', async () => {
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

    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initRequest)
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    // Verify JSON-RPC response structure
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result).toBeDefined();
    expect(body.result.serverInfo).toBeDefined();
    expect(body.result.serverInfo.name).toBe('osm-tools');
    expect(body.result.serverInfo.version).toBe('1.0.0');
    expect(body.result.capabilities).toBeDefined();
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.protocolVersion).toBe('2024-11-05');
  });

  it('should return 405 for GET request to /mcp endpoint', async () => {
    const response = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toBe('Method not allowed');
  });

  it('should expose /mcp endpoint that accepts POST requests and returns tools', async () => {
    // First initialize
    const initResponse = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });

    expect(initResponse.status).toBe(200);

    // Then list tools
    const toolsResponse = await fetch(`http://${serverAddress.address}:${serverAddress.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    expect(toolsResponse.status).toBe(200);

    const body = await toolsResponse.json();

    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(2);
    expect(body.result).toBeDefined();
    expect(body.result.tools).toBeDefined();
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBe(4);

    // Verify tool names
    const toolNames = body.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('geocode');
    expect(toolNames).toContain('reverse_geocode');
    expect(toolNames).toContain('poi_search');
    expect(toolNames).toContain('route');
  });
});
