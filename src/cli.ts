#!/usr/bin/env node

import { startHttpTransport } from './transport/index.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { port?: number } {
  const args = process.argv.slice(2);
  const result: { port?: number } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
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
osm-tools - OpenStreetMap MCP Server (HTTP-only)

USAGE:
  osm-tools [OPTIONS]

OPTIONS:
  -p, --port <number>     HTTP server port (default: 8080)
  -h, --help              Show this help message
  -v, --version           Show version

ENVIRONMENT VARIABLES:
  OSM_HTTP_PORT      HTTP server port
  OSM_USER_AGENT     User-Agent header for API requests
  OSM_THROTTLE_MS    Delay between API requests in milliseconds
  OSM_NOMINATIM_URL  Nominatim API base URL
  OSM_OVERPASS_URL   Overpass API base URL
  OSM_OSRM_URL       OSRM API base URL

EXAMPLES:
  # Start with HTTP transport on default port 8080
  osm-tools

  # Start with custom port
  osm-tools --port 3000
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const port = args.port ?? parseInt(process.env.OSM_HTTP_PORT ?? '8080', 10);

  // Always use HTTP transport
  await startHttpTransport({ port });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
