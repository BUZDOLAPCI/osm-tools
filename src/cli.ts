#!/usr/bin/env node

import { createServer } from './server.js';
import { startStdioTransport, startHttpTransport } from './transport/index.js';
import { getConfig, setConfig } from './config.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { transport?: 'stdio' | 'http'; port?: number } {
  const args = process.argv.slice(2);
  const result: { transport?: 'stdio' | 'http'; port?: number } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--transport' || arg === '-t') {
      const value = args[++i];
      if (value === 'stdio' || value === 'http') {
        result.transport = value;
      } else {
        console.error(`Invalid transport: ${value}. Use 'stdio' or 'http'.`);
        process.exit(1);
      }
    } else if (arg === '--port' || arg === '-p') {
      const value = parseInt(args[++i], 10);
      if (!isNaN(value)) {
        result.port = value;
      } else {
        console.error(`Invalid port: ${args[i]}. Must be a number.`);
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('osm-tools v1.0.0');
      process.exit(0);
    }
  }

  return result;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
osm-tools - OpenStreetMap MCP Server

USAGE:
  osm-tools [OPTIONS]

OPTIONS:
  -t, --transport <mode>  Transport mode: 'stdio' (default) or 'http'
  -p, --port <number>     HTTP server port (default: 3000)
  -h, --help              Show this help message
  -v, --version           Show version

ENVIRONMENT VARIABLES:
  OSM_TRANSPORT      Transport mode (stdio or http)
  OSM_HTTP_PORT      HTTP server port
  OSM_USER_AGENT     User-Agent header for API requests
  OSM_THROTTLE_MS    Delay between API requests in milliseconds
  OSM_NOMINATIM_URL  Nominatim API base URL
  OSM_OVERPASS_URL   Overpass API base URL
  OSM_OSRM_URL       OSRM API base URL

EXAMPLES:
  # Start with stdio transport (for MCP clients)
  osm-tools

  # Start with HTTP transport on port 8080
  osm-tools --transport http --port 8080
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Apply command line overrides
  if (args.transport) {
    setConfig({ transport: args.transport });
  }
  if (args.port) {
    setConfig({ httpPort: args.port });
  }

  const config = getConfig();

  if (config.transport === 'http') {
    // Pass the factory function for HTTP transport (creates server per session)
    await startHttpTransport(createServer);
  } else {
    // For stdio, create a single server instance
    const server = createServer();
    await startStdioTransport(server);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
