/**
 * OSM Tools MCP Server
 *
 * OpenStreetMap primitives: geocode, reverse geocode, POIs, routing.
 */

// Export server creation
export { createServer } from './server.js';

// Export configuration
export { getConfig, setConfig, loadConfig, type Config } from './config.js';

// Export transport utilities
export { startHttpTransport } from './transport/index.js';

// Export tools
export {
  tools,
  getTool,
  geocodeTool,
  geocode,
  reverseGeocodeTool,
  reverseGeocode,
  poiSearchTool,
  poiSearch,
  routeTool,
  route,
} from './tools/index.js';

// Export types
export type {
  // Response envelope
  Response,
  SuccessResponse,
  ErrorResponse,
  ResponseMeta,
  // Tool definitions
  ToolDefinition,
  // Geocode
  GeocodeInput,
  GeocodeResult,
  GeocodeOutput,
  // Reverse geocode
  ReverseGeocodeInput,
  ReverseGeocodeResult,
  ReverseGeocodeOutput,
  AddressDetails,
  // POI search
  PoiSearchInput,
  PoiResult,
  PoiSearchOutput,
  // Route
  RouteInput,
  RouteResult,
  RouteOutput,
  RouteStep,
} from './types.js';
