import { getConfig, fetchWithThrottle } from '../config.js';
import {
  RouteInput,
  RouteInputSchema,
  RouteOutput,
  RouteResult,
  RouteStep,
  OsrmResponse,
  Response,
  ToolDefinition,
} from '../types.js';

/**
 * Map our mode names to OSRM profile names
 */
function getOsrmProfile(mode: 'driving' | 'cycling' | 'walking'): string {
  switch (mode) {
    case 'driving':
      return 'car';
    case 'cycling':
      return 'bike';
    case 'walking':
      return 'foot';
    default:
      return 'car';
  }
}

/**
 * Build human-readable instruction from OSRM maneuver
 */
function buildInstruction(maneuver: { type: string; modifier?: string }): string {
  const { type, modifier } = maneuver;

  switch (type) {
    case 'depart':
      return 'Depart';
    case 'arrive':
      return 'Arrive at destination';
    case 'turn':
      return `Turn ${modifier || 'ahead'}`;
    case 'continue':
      return 'Continue straight';
    case 'merge':
      return `Merge ${modifier || ''}`.trim();
    case 'fork':
      return `Take the ${modifier || 'fork'}`;
    case 'roundabout':
      return 'Enter roundabout';
    case 'exit roundabout':
      return 'Exit roundabout';
    case 'new name':
      return 'Continue';
    case 'end of road':
      return `At end of road, turn ${modifier || 'ahead'}`;
    case 'notification':
      return modifier || 'Continue';
    default:
      return modifier ? `${type} ${modifier}` : type;
  }
}

/**
 * Calculate route between two points using OSRM
 */
async function route(input: RouteInput): Promise<Response<RouteOutput>> {
  const config = getConfig();
  const warnings: string[] = [];

  try {
    const profile = getOsrmProfile(input.mode);

    // OSRM expects coordinates as lon,lat (opposite of most APIs)
    const startCoord = `${input.start[1]},${input.start[0]}`;
    const endCoord = `${input.end[1]},${input.end[0]}`;

    // Build OSRM API URL
    const url = `${config.osrmUrl}/route/v1/${profile}/${startCoord};${endCoord}?overview=full&geometries=polyline&steps=true`;

    const response = await fetchWithThrottle(url);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'OSRM_ERROR',
          message: `OSRM API returned ${response.status}: ${response.statusText}`,
        },
        meta: {
          source: 'osrm',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    const data = (await response.json()) as OsrmResponse;

    if (data.code !== 'Ok') {
      return {
        ok: false,
        error: {
          code: 'OSRM_ROUTE_ERROR',
          message: `OSRM could not calculate route: ${data.code}`,
        },
        meta: {
          source: 'osrm',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    if (!data.routes || data.routes.length === 0) {
      return {
        ok: false,
        error: {
          code: 'OSRM_NO_ROUTE',
          message: 'No route found between the specified points',
        },
        meta: {
          source: 'osrm',
          retrieved_at: new Date().toISOString(),
          warnings,
        },
      };
    }

    const osrmRoute = data.routes[0];

    // Extract steps from all legs
    const steps: RouteStep[] = [];
    for (const leg of osrmRoute.legs) {
      for (const step of leg.steps) {
        steps.push({
          instruction: buildInstruction(step.maneuver),
          distance_m: step.distance,
          duration_s: step.duration,
          name: step.name || '',
        });
      }
    }

    // Build summary from leg summaries
    const summary = osrmRoute.legs.map((leg) => leg.summary).join(' via ');

    const result: RouteResult = {
      distance_km: osrmRoute.distance / 1000,
      duration_minutes: osrmRoute.duration / 60,
      geometry: osrmRoute.geometry,
      steps,
      summary,
    };

    return {
      ok: true,
      data: result,
      meta: {
        source: 'osrm',
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
        code: 'ROUTE_ERROR',
        message: `Failed to calculate route: ${errorMessage}`,
      },
      meta: {
        source: 'osrm',
        retrieved_at: new Date().toISOString(),
        warnings,
      },
    };
  }
}

export const routeTool: ToolDefinition = {
  name: 'route',
  description:
    'Calculate a route between two points using OSRM. Supports driving, cycling, and walking modes. Returns distance, duration, encoded polyline geometry, and turn-by-turn instructions.',
  inputSchema: RouteInputSchema,
  handler: async (input: unknown): Promise<Response<unknown>> => {
    const parsed = RouteInputSchema.parse(input);
    return route(parsed);
  },
};

export { route, getOsrmProfile };
