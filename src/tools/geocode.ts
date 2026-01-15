import { getConfig, fetchWithThrottle } from '../config.js';
import {
  GeocodeInput,
  GeocodeInputSchema,
  GeocodeOutput,
  GeocodeResult,
  NominatimSearchResult,
  Response,
  ToolDefinition,
} from '../types.js';

/**
 * Forward geocoding: search by address/place name
 * Returns lat/lon and address details
 */
async function geocode(input: GeocodeInput): Promise<Response<GeocodeOutput>> {
  const config = getConfig();
  const warnings: string[] = [];

  try {
    // Build query parameters
    const params = new URLSearchParams({
      q: input.query,
      format: 'json',
      addressdetails: '1',
      limit: '10',
    });

    // Add bounding box if provided (viewbox parameter)
    // Nominatim expects: viewbox=minLon,maxLat,maxLon,minLat
    if (input.bbox) {
      const [minLon, minLat, maxLon, maxLat] = input.bbox;
      params.set('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`);
      params.set('bounded', '1');
    }

    // Add country code filter if provided
    if (input.country) {
      params.set('countrycodes', input.country.toLowerCase());
    }

    const url = `${config.nominatimUrl}/search?${params.toString()}`;
    const response = await fetchWithThrottle(url);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'NOMINATIM_ERROR',
          message: `Nominatim API returned ${response.status}: ${response.statusText}`,
        },
        meta: {
          source: 'nominatim',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    const rawResults = (await response.json()) as NominatimSearchResult[];

    // Transform results to our output format
    const results: GeocodeResult[] = rawResults.map((r) => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      display_name: r.display_name,
      type: r.type,
      importance: r.importance,
      place_id: r.place_id,
      osm_type: r.osm_type,
      osm_id: r.osm_id,
      boundingbox: r.boundingbox,
    }));

    return {
      ok: true,
      data: results,
      meta: {
        source: 'nominatim',
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
        code: 'GEOCODE_ERROR',
        message: `Failed to geocode: ${errorMessage}`,
      },
      meta: {
        source: 'nominatim',
        retrieved_at: new Date().toISOString(),
        warnings,
      },
    };
  }
}

export const geocodeTool: ToolDefinition = {
  name: 'geocode',
  description:
    'Forward geocoding: search for a location by address or place name. Returns latitude/longitude coordinates and address details. Supports optional bounding box and country filters.',
  inputSchema: GeocodeInputSchema,
  handler: async (input: unknown): Promise<Response<unknown>> => {
    const parsed = GeocodeInputSchema.parse(input);
    return geocode(parsed);
  },
};

export { geocode };
