import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocode } from '../../src/tools/geocode.js';
import { reverseGeocode } from '../../src/tools/reverse.js';
import { poiSearch, buildOverpassQuery } from '../../src/tools/poi.js';
import { route, getOsrmProfile } from '../../src/tools/route.js';
import { setConfig } from '../../src/config.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  // Set throttle to 0 for tests
  setConfig({ throttleMs: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('geocode', () => {
  it('should geocode an address successfully', async () => {
    const mockResponse = [
      {
        place_id: 123,
        licence: 'Data © OpenStreetMap contributors',
        osm_type: 'way',
        osm_id: 456,
        lat: '40.7128',
        lon: '-74.0060',
        display_name: 'New York, NY, USA',
        type: 'city',
        importance: 0.9,
        boundingbox: ['40.4774', '40.9176', '-74.2591', '-73.7004'],
        class: 'place',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await geocode({ query: 'New York' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].lat).toBe(40.7128);
      expect(result.data[0].lon).toBe(-74.006);
      expect(result.data[0].display_name).toBe('New York, NY, USA');
      expect(result.meta.source).toBe('nominatim');
    }
  });

  it('should include bbox parameter when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await geocode({
      query: 'Restaurant',
      bbox: [-74.1, 40.7, -73.9, 40.8],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('viewbox=-74.1%2C40.8%2C-73.9%2C40.7'),
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('bounded=1'),
      expect.any(Object)
    );
  });

  it('should include country code when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await geocode({ query: 'Paris', country: 'FR' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('countrycodes=fr'),
      expect.any(Object)
    );
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await geocode({ query: 'test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOMINATIM_ERROR');
    }
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await geocode({ query: 'test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GEOCODE_ERROR');
      expect(result.error.message).toContain('Network failure');
    }
  });
});

describe('reverseGeocode', () => {
  it('should reverse geocode coordinates successfully', async () => {
    const mockResponse = {
      place_id: 123,
      licence: 'Data © OpenStreetMap contributors',
      osm_type: 'way',
      osm_id: 456,
      lat: '40.7128',
      lon: '-74.0060',
      display_name: '123 Main St, New York, NY 10001, USA',
      address: {
        house_number: '123',
        road: 'Main St',
        city: 'New York',
        state: 'New York',
        postcode: '10001',
        country: 'United States',
        country_code: 'us',
      },
      boundingbox: ['40.712', '40.713', '-74.007', '-74.005'],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await reverseGeocode({ lat: 40.7128, lon: -74.006 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.display_name).toBe('123 Main St, New York, NY 10001, USA');
      expect(result.data.address.city).toBe('New York');
      expect(result.meta.source).toBe('nominatim');
    }
  });

  it('should handle not found response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ error: 'Unable to geocode' }),
    });

    const result = await reverseGeocode({ lat: 0, lon: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOMINATIM_NOT_FOUND');
    }
  });
});

describe('poiSearch', () => {
  describe('buildOverpassQuery', () => {
    it('should build query with bbox', () => {
      const query = buildOverpassQuery({
        center_or_bbox: { bbox: [40.7, -74.1, 40.8, -73.9] },
        tags: { amenity: 'restaurant' },
        limit: 10,
      });

      expect(query).toContain('[out:json]');
      expect(query).toContain('["amenity"="restaurant"]');
      expect(query).toContain('(40.7,-74.1,40.8,-73.9)');
      expect(query).toContain('out center 10');
    });

    it('should build query with center point', () => {
      const query = buildOverpassQuery({
        center_or_bbox: { center: [40.7128, -74.006] },
        tags: { amenity: 'cafe' },
      });

      expect(query).toContain('(around:1000,40.7128,-74.006)');
      expect(query).toContain('["amenity"="cafe"]');
    });

    it('should handle multiple tags', () => {
      const query = buildOverpassQuery({
        center_or_bbox: { bbox: [40.7, -74.1, 40.8, -73.9] },
        tags: { amenity: 'restaurant', cuisine: 'italian' },
      });

      expect(query).toContain('["amenity"="restaurant"]["cuisine"="italian"]');
    });
  });

  it('should search for POIs successfully', async () => {
    const mockResponse = {
      version: 0.6,
      generator: 'Overpass API',
      osm3s: {
        timestamp_osm_base: '2024-01-01T00:00:00Z',
        copyright: 'The data is from OpenStreetMap',
      },
      elements: [
        {
          type: 'node' as const,
          id: 123,
          lat: 40.7128,
          lon: -74.006,
          tags: { name: 'Test Restaurant', amenity: 'restaurant' },
        },
        {
          type: 'way' as const,
          id: 456,
          center: { lat: 40.713, lon: -74.007 },
          tags: { name: 'Another Restaurant', amenity: 'restaurant' },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await poiSearch({
      center_or_bbox: { bbox: [40.7, -74.1, 40.8, -73.9] },
      tags: { amenity: 'restaurant' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Test Restaurant');
      expect(result.data[1].name).toBe('Another Restaurant');
      expect(result.meta.source).toBe('overpass');
    }
  });

  it('should handle elements without coordinates', async () => {
    const mockResponse = {
      version: 0.6,
      generator: 'Overpass API',
      osm3s: {
        timestamp_osm_base: '2024-01-01T00:00:00Z',
        copyright: 'The data is from OpenStreetMap',
      },
      elements: [
        {
          type: 'relation' as const,
          id: 789,
          tags: { name: 'No Coords' },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await poiSearch({
      center_or_bbox: { center: [40.7128, -74.006] },
      tags: { amenity: 'restaurant' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
      expect(result.meta.warnings).toHaveLength(1);
    }
  });
});

describe('route', () => {
  describe('getOsrmProfile', () => {
    it('should map driving to car', () => {
      expect(getOsrmProfile('driving')).toBe('car');
    });

    it('should map cycling to bike', () => {
      expect(getOsrmProfile('cycling')).toBe('bike');
    });

    it('should map walking to foot', () => {
      expect(getOsrmProfile('walking')).toBe('foot');
    });
  });

  it('should calculate route successfully', async () => {
    const mockResponse = {
      code: 'Ok',
      routes: [
        {
          geometry: 'encoded_polyline_string',
          legs: [
            {
              steps: [
                {
                  geometry: 'step_geom',
                  maneuver: { type: 'depart', location: [-74.006, 40.7128] },
                  mode: 'driving',
                  driving_side: 'right',
                  name: 'Main St',
                  intersections: [],
                  weight: 100,
                  duration: 60,
                  distance: 500,
                },
                {
                  geometry: 'step_geom',
                  maneuver: { type: 'turn', modifier: 'right', location: [-74.007, 40.713] },
                  mode: 'driving',
                  driving_side: 'right',
                  name: 'Broadway',
                  intersections: [],
                  weight: 200,
                  duration: 120,
                  distance: 1000,
                },
                {
                  geometry: 'step_geom',
                  maneuver: { type: 'arrive', location: [-74.008, 40.714] },
                  mode: 'driving',
                  driving_side: 'right',
                  name: '',
                  intersections: [],
                  weight: 0,
                  duration: 0,
                  distance: 0,
                },
              ],
              summary: 'Main St, Broadway',
              weight: 300,
              duration: 180,
              distance: 1500,
            },
          ],
          weight_name: 'routability',
          weight: 300,
          duration: 180,
          distance: 1500,
        },
      ],
      waypoints: [
        { hint: 'hint1', distance: 5, name: 'Start', location: [-74.006, 40.7128] },
        { hint: 'hint2', distance: 3, name: 'End', location: [-74.008, 40.714] },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await route({
      start: [40.7128, -74.006],
      end: [40.714, -74.008],
      mode: 'driving',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.distance_km).toBe(1.5);
      expect(result.data.duration_minutes).toBe(3);
      expect(result.data.geometry).toBe('encoded_polyline_string');
      expect(result.data.steps).toHaveLength(3);
      expect(result.data.steps[0].instruction).toBe('Depart');
      expect(result.data.steps[1].instruction).toBe('Turn right');
      expect(result.data.steps[2].instruction).toBe('Arrive at destination');
      expect(result.meta.source).toBe('osrm');
    }
  });

  it('should handle no route found', async () => {
    const mockResponse = {
      code: 'NoRoute',
      routes: [],
      waypoints: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await route({
      start: [0, 0],
      end: [1, 1],
      mode: 'driving',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('OSRM_ROUTE_ERROR');
    }
  });

  it('should use correct coordinates format for OSRM (lon,lat)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'Ok',
          routes: [
            {
              geometry: 'test',
              legs: [],
              weight_name: 'routability',
              weight: 0,
              duration: 0,
              distance: 0,
            },
          ],
          waypoints: [],
        }),
    });

    await route({
      start: [40.7128, -74.006],
      end: [40.714, -74.008],
      mode: 'walking',
    });

    // OSRM expects lon,lat format
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/-74.006,40.7128;-74.008,40.714'),
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/foot/'),
      expect.any(Object)
    );
  });
});
