import { ToolDefinition } from '../types.js';
import { geocodeTool, geocode } from './geocode.js';
import { reverseGeocodeTool, reverseGeocode } from './reverse.js';
import { poiSearchTool, poiSearch, buildOverpassQuery } from './poi.js';
import { routeTool, route, getOsrmProfile } from './route.js';

/**
 * All available tools
 */
export const tools: ToolDefinition[] = [
  geocodeTool,
  reverseGeocodeTool,
  poiSearchTool,
  routeTool,
];

/**
 * Get a tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}

// Export individual tools and functions
export {
  geocodeTool,
  geocode,
  reverseGeocodeTool,
  reverseGeocode,
  poiSearchTool,
  poiSearch,
  buildOverpassQuery,
  routeTool,
  route,
  getOsrmProfile,
};
