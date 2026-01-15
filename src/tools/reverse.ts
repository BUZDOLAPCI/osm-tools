import { getConfig, fetchWithThrottle } from '../config.js';
import {
  ReverseGeocodeInput,
  ReverseGeocodeInputSchema,
  ReverseGeocodeOutput,
  ReverseGeocodeResult,
  NominatimReverseResult,
  Response,
  ToolDefinition,
} from '../types.js';

/**
 * Reverse geocoding: get address from coordinates
 */
async function reverseGeocode(
  input: ReverseGeocodeInput
): Promise<Response<ReverseGeocodeOutput>> {
  const config = getConfig();
  const warnings: string[] = [];

  try {
    // Build query parameters
    const params = new URLSearchParams({
      lat: input.lat.toString(),
      lon: input.lon.toString(),
      format: 'json',
      addressdetails: '1',
    });

    const url = `${config.nominatimUrl}/reverse?${params.toString()}`;
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

    const rawResult = (await response.json()) as NominatimReverseResult;

    // Check for error response (Nominatim returns { error: "..." } on failure)
    if ('error' in rawResult) {
      return {
        ok: false,
        error: {
          code: 'NOMINATIM_NOT_FOUND',
          message: `No address found for coordinates: ${(rawResult as { error: string }).error}`,
        },
        meta: {
          source: 'nominatim',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    // Transform result to our output format
    const result: ReverseGeocodeResult = {
      lat: parseFloat(rawResult.lat),
      lon: parseFloat(rawResult.lon),
      display_name: rawResult.display_name,
      address: rawResult.address,
      place_id: rawResult.place_id,
      osm_type: rawResult.osm_type,
      osm_id: rawResult.osm_id,
    };

    return {
      ok: true,
      data: result,
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
        code: 'REVERSE_GEOCODE_ERROR',
        message: `Failed to reverse geocode: ${errorMessage}`,
      },
      meta: {
        source: 'nominatim',
        retrieved_at: new Date().toISOString(),
        warnings,
      },
    };
  }
}

export const reverseGeocodeTool: ToolDefinition = {
  name: 'reverse_geocode',
  description:
    'Reverse geocoding: get a human-readable address from latitude/longitude coordinates. Returns the full display name and detailed address breakdown.',
  inputSchema: ReverseGeocodeInputSchema,
  handler: async (input: unknown): Promise<Response<unknown>> => {
    const parsed = ReverseGeocodeInputSchema.parse(input);
    return reverseGeocode(parsed);
  },
};

export { reverseGeocode };
