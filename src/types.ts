import { z } from 'zod';

// =============================================================================
// Standard Response Envelope
// =============================================================================

export interface ResponseMeta {
  source?: string;
  retrieved_at: string;
  pagination?: {
    next_cursor: string | null;
  };
  warnings: string[];
}

export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  meta: ResponseMeta;
}

export type Response<T> = SuccessResponse<T> | ErrorResponse;

// =============================================================================
// Geocode Types
// =============================================================================

export const GeocodeInputSchema = z.object({
  query: z.string().min(1).describe('Address or place name to search for'),
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional()
    .describe('Bounding box [minLon, minLat, maxLon, maxLat] to restrict search'),
  country: z
    .string()
    .optional()
    .describe('ISO 3166-1 alpha-2 country code to restrict search'),
});

export type GeocodeInput = z.infer<typeof GeocodeInputSchema>;

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
  type: string;
  importance: number;
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  boundingbox?: [string, string, string, string];
}

export type GeocodeOutput = GeocodeResult[];

// =============================================================================
// Reverse Geocode Types
// =============================================================================

export const ReverseGeocodeInputSchema = z.object({
  lat: z.number().min(-90).max(90).describe('Latitude'),
  lon: z.number().min(-180).max(180).describe('Longitude'),
});

export type ReverseGeocodeInput = z.infer<typeof ReverseGeocodeInputSchema>;

export interface AddressDetails {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

export interface ReverseGeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
  address: AddressDetails;
  place_id: number;
  osm_type?: string;
  osm_id?: number;
}

export type ReverseGeocodeOutput = ReverseGeocodeResult;

// =============================================================================
// POI Search Types
// =============================================================================

export const PoiSearchInputSchema = z.object({
  center_or_bbox: z
    .object({
      center: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe('Center point [lat, lon] with 1km radius'),
      bbox: z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .optional()
        .describe('Bounding box [south, west, north, east]'),
    })
    .refine((val) => val.center || val.bbox, {
      message: 'Either center or bbox must be provided',
    })
    .describe('Search area: either center point or bounding box'),
  tags: z
    .record(z.string(), z.string())
    .describe('OSM key-value tags to filter POIs, e.g., {"amenity": "restaurant"}'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum number of results (default 25, max 100)'),
});

export type PoiSearchInput = z.infer<typeof PoiSearchInputSchema>;

export interface PoiResult {
  id: number;
  name: string | null;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  type: 'node' | 'way' | 'relation';
}

export type PoiSearchOutput = PoiResult[];

// =============================================================================
// Route Types
// =============================================================================

export const RouteInputSchema = z.object({
  start: z.tuple([z.number(), z.number()]).describe('Start point [lat, lon]'),
  end: z.tuple([z.number(), z.number()]).describe('End point [lat, lon]'),
  mode: z
    .enum(['driving', 'cycling', 'walking'])
    .describe('Travel mode: driving, cycling, or walking'),
});

export type RouteInput = z.infer<typeof RouteInputSchema>;

export interface RouteStep {
  instruction: string;
  distance_m: number;
  duration_s: number;
  name: string;
}

export interface RouteResult {
  distance_km: number;
  duration_minutes: number;
  geometry: string; // Encoded polyline
  steps: RouteStep[];
  summary: string;
}

export type RouteOutput = RouteResult;

// =============================================================================
// Nominatim API Response Types
// =============================================================================

export interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
  boundingbox: [string, string, string, string];
  class: string;
}

export interface NominatimReverseResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: AddressDetails;
  boundingbox: [string, string, string, string];
}

// =============================================================================
// Overpass API Response Types
// =============================================================================

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

// =============================================================================
// OSRM API Response Types
// =============================================================================

export interface OsrmManeuver {
  type: string;
  modifier?: string;
  location: [number, number];
}

export interface OsrmStep {
  geometry: string;
  maneuver: OsrmManeuver;
  mode: string;
  driving_side: string;
  name: string;
  intersections: unknown[];
  weight: number;
  duration: number;
  distance: number;
}

export interface OsrmLeg {
  steps: OsrmStep[];
  summary: string;
  weight: number;
  duration: number;
  distance: number;
}

export interface OsrmRoute {
  geometry: string;
  legs: OsrmLeg[];
  weight_name: string;
  weight: number;
  duration: number;
  distance: number;
}

export interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
  waypoints: {
    hint: string;
    distance: number;
    name: string;
    location: [number, number];
  }[];
}

// =============================================================================
// Tool Definition Types
// =============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: unknown) => Promise<Response<unknown>>;
}
