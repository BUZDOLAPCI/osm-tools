import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools, getTool } from './tools/index.js';

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'osm-tools',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    };
  });

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = getTool(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'UNKNOWN_TOOL',
                message: `Unknown tool: ${name}`,
              },
              meta: {
                retrieved_at: new Date().toISOString(),
                warnings: [],
              },
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.ok,
      };
    } catch (error) {
      let errorResponse;

      if (error instanceof ZodError) {
        errorResponse = {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid input: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
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
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          meta: {
            retrieved_at: new Date().toISOString(),
            warnings: [],
          },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
