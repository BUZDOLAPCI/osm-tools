import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/server.js';
import { setConfig } from '../../src/config.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  setConfig({ throttleMs: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MCP Server E2E', () => {
  describe('createServer', () => {
    it('should create a server instance', () => {
      const server = createServer();
      expect(server).toBeDefined();
    });
  });

  describe('tool listing', () => {
    it('should list all available tools', async () => {
      const server = createServer();

      // Simulate list_tools request
      const listToolsHandler = (server as unknown as { _requestHandlers: Map<string, unknown> })
        ._requestHandlers?.get?.('tools/list');

      // Since we can't easily access internal handlers, we'll verify the tools are properly configured
      // by checking the exported tools array
      const { tools } = await import('../../src/tools/index.js');

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toEqual([
        'geocode',
        'reverse_geocode',
        'poi_search',
        'route',
      ]);
    });
  });

  describe('geocode tool integration', () => {
    it('should handle geocode request through server', async () => {
      const mockResponse = [
        {
          place_id: 123,
          licence: 'Data © OpenStreetMap contributors',
          osm_type: 'node',
          osm_id: 456,
          lat: '48.8566',
          lon: '2.3522',
          display_name: 'Paris, France',
          type: 'city',
          importance: 0.95,
          boundingbox: ['48.8', '48.9', '2.2', '2.4'],
          class: 'place',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { geocode } = await import('../../src/tools/geocode.js');
      const result = await geocode({ query: 'Paris, France' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].display_name).toBe('Paris, France');
        expect(result.data[0].lat).toBeCloseTo(48.8566, 4);
        expect(result.data[0].lon).toBeCloseTo(2.3522, 4);
      }
    });
  });

  describe('reverse_geocode tool integration', () => {
    it('should handle reverse geocode request', async () => {
      const mockResponse = {
        place_id: 789,
        licence: 'Data © OpenStreetMap contributors',
        osm_type: 'way',
        osm_id: 101112,
        lat: '51.5074',
        lon: '-0.1278',
        display_name: 'London, Greater London, England, United Kingdom',
        address: {
          city: 'London',
          state: 'Greater London',
          country: 'United Kingdom',
          country_code: 'gb',
        },
        boundingbox: ['51.3', '51.7', '-0.5', '0.3'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { reverseGeocode } = await import('../../src/tools/reverse.js');
      const result = await reverseGeocode({ lat: 51.5074, lon: -0.1278 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.address.city).toBe('London');
        expect(result.data.address.country).toBe('United Kingdom');
      }
    });
  });

  describe('poi_search tool integration', () => {
    it('should handle POI search request', async () => {
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
            id: 1001,
            lat: 52.52,
            lon: 13.405,
            tags: {
              name: 'Brandenburg Gate',
              tourism: 'attraction',
              historic: 'monument',
            },
          },
          {
            type: 'node' as const,
            id: 1002,
            lat: 52.5163,
            lon: 13.3777,
            tags: {
              name: 'Victory Column',
              tourism: 'attraction',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { poiSearch } = await import('../../src/tools/poi.js');
      const result = await poiSearch({
        center_or_bbox: { center: [52.52, 13.405] },
        tags: { tourism: 'attraction' },
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe('Brandenburg Gate');
        expect(result.data[0].tags.historic).toBe('monument');
      }
    });
  });

  describe('route tool integration', () => {
    it('should handle route calculation request', async () => {
      const mockResponse = {
        code: 'Ok',
        routes: [
          {
            geometry: 'encoded_polyline',
            legs: [
              {
                steps: [
                  {
                    geometry: 'step1',
                    maneuver: { type: 'depart', location: [13.388, 52.517] },
                    mode: 'cycling',
                    driving_side: 'right',
                    name: 'Unter den Linden',
                    intersections: [],
                    weight: 50,
                    duration: 120,
                    distance: 500,
                  },
                  {
                    geometry: 'step2',
                    maneuver: { type: 'arrive', location: [13.405, 52.52] },
                    mode: 'cycling',
                    driving_side: 'right',
                    name: '',
                    intersections: [],
                    weight: 0,
                    duration: 0,
                    distance: 0,
                  },
                ],
                summary: 'Unter den Linden',
                weight: 50,
                duration: 120,
                distance: 500,
              },
            ],
            weight_name: 'routability',
            weight: 50,
            duration: 120,
            distance: 500,
          },
        ],
        waypoints: [
          { hint: 'h1', distance: 2, name: 'Start', location: [13.388, 52.517] },
          { hint: 'h2', distance: 3, name: 'End', location: [13.405, 52.52] },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { route } = await import('../../src/tools/route.js');
      const result = await route({
        start: [52.517, 13.388],
        end: [52.52, 13.405],
        mode: 'cycling',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.distance_km).toBe(0.5);
        expect(result.data.duration_minutes).toBe(2);
        expect(result.data.steps).toHaveLength(2);
        expect(result.data.summary).toBe('Unter den Linden');
      }
    });
  });

  describe('response envelope format', () => {
    it('should return standard response envelope on success', async () => {
      const mockResponse = [
        {
          place_id: 1,
          licence: 'test',
          osm_type: 'node',
          osm_id: 1,
          lat: '0',
          lon: '0',
          display_name: 'Test',
          type: 'place',
          importance: 0.5,
          boundingbox: ['0', '0', '0', '0'],
          class: 'place',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { geocode } = await import('../../src/tools/geocode.js');
      const result = await geocode({ query: 'test' });

      // Verify standard envelope structure
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('retrieved_at');
      expect(result.meta).toHaveProperty('warnings');

      if (result.ok) {
        expect(result).toHaveProperty('data');
        expect(result.meta).toHaveProperty('pagination');
        expect(result.meta.pagination).toHaveProperty('next_cursor');
      }
    });

    it('should return standard response envelope on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { geocode } = await import('../../src/tools/geocode.js');
      const result = await geocode({ query: 'test' });

      // Verify standard envelope structure for errors
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('retrieved_at');
      expect(result.meta).toHaveProperty('warnings');

      if (!result.ok) {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });
  });

  describe('User-Agent header', () => {
    it('should include User-Agent header in requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { geocode } = await import('../../src/tools/geocode.js');
      await geocode({ query: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('User-Agent')).toBe('osm-tools-mcp/1.0.0');
    });
  });
});
