import { getConfig, fetchWithThrottle } from '../config.js';
import {
  PoiSearchInput,
  PoiSearchInputSchema,
  PoiSearchOutput,
  PoiResult,
  OverpassResponse,
  OverpassElement,
  Response,
  ToolDefinition,
} from '../types.js';

/**
 * Build Overpass QL query from search parameters
 */
function buildOverpassQuery(input: PoiSearchInput): string {
  const { center_or_bbox, tags, limit = 25 } = input;

  // Build tag filters
  const tagFilters = Object.entries(tags)
    .map(([key, value]) => `["${key}"="${value}"]`)
    .join('');

  // Determine the area specification
  let areaSpec: string;
  if (center_or_bbox.bbox) {
    // bbox format for Overpass: (south, west, north, east)
    const [south, west, north, east] = center_or_bbox.bbox;
    areaSpec = `(${south},${west},${north},${east})`;
  } else if (center_or_bbox.center) {
    // For center point, use around filter with 1km radius
    const [lat, lon] = center_or_bbox.center;
    areaSpec = `(around:1000,${lat},${lon})`;
  } else {
    throw new Error('Either center or bbox must be provided');
  }

  // Build the query - search nodes, ways, and relations
  // Using out center to get center coordinates for ways/relations
  const query = `
[out:json][timeout:25];
(
  node${tagFilters}${areaSpec};
  way${tagFilters}${areaSpec};
  relation${tagFilters}${areaSpec};
);
out center ${limit};
`.trim();

  return query;
}

/**
 * Extract coordinates from an Overpass element
 */
function extractCoordinates(
  element: OverpassElement
): { lat: number; lon: number } | null {
  if (element.lat !== undefined && element.lon !== undefined) {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center) {
    return { lat: element.center.lat, lon: element.center.lon };
  }
  return null;
}

/**
 * Search for Points of Interest using Overpass API
 */
async function poiSearch(input: PoiSearchInput): Promise<Response<PoiSearchOutput>> {
  const config = getConfig();
  const warnings: string[] = [];

  try {
    const query = buildOverpassQuery(input);

    const response = await fetchWithThrottle(config.overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: {
          code: 'OVERPASS_ERROR',
          message: `Overpass API returned ${response.status}: ${errorText}`,
        },
        meta: {
          source: 'overpass',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    const data = (await response.json()) as OverpassResponse;

    // Transform results to our output format
    const results: PoiResult[] = [];
    for (const element of data.elements) {
      const coords = extractCoordinates(element);
      if (!coords) {
        warnings.push(`Element ${element.id} has no coordinates, skipping`);
        continue;
      }

      results.push({
        id: element.id,
        name: element.tags?.name ?? null,
        lat: coords.lat,
        lon: coords.lon,
        tags: element.tags ?? {},
        type: element.type,
      });
    }

    return {
      ok: true,
      data: results,
      meta: {
        source: 'overpass',
        retrieved_at: new Date().toISOString(),
        pagination: { next_cursor: null },
        warnings,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      error: {
        code: 'POI_SEARCH_ERROR',
        message: `Failed to search POIs: ${errorMessage}`,
      },
      meta: {
        source: 'overpass',
        retrieved_at: new Date().toISOString(),
        warnings,
      },
    };
  }
}

export const poiSearchTool: ToolDefinition = {
  name: 'poi_search',
  description:
    'Search for Points of Interest using OpenStreetMap Overpass API. Filter by OSM tags (e.g., {"amenity": "restaurant"}) within a bounding box or around a center point (1km radius).',
  inputSchema: PoiSearchInputSchema,
  handler: async (input: unknown): Promise<Response<unknown>> => {
    const parsed = PoiSearchInputSchema.parse(input);
    return poiSearch(parsed);
  },
};

export { poiSearch, buildOverpassQuery };
