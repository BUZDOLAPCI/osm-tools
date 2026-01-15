# osm-tools

OpenStreetMap MCP Server providing geocoding, reverse geocoding, POI search, and routing capabilities.

## Features

- **Geocode**: Forward geocoding - search by address/place name
- **Reverse Geocode**: Get address from coordinates
- **POI Search**: Search for Points of Interest using Overpass API
- **Route**: Calculate routes between two points using OSRM

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio)

```bash
npm start
# or
node dist/cli.js --transport stdio
```

### As HTTP Server

```bash
node dist/cli.js --transport http --port 3000
```

### Configuration

Configuration can be set via environment variables or command line arguments:

| Environment Variable | CLI Flag | Default | Description |
|---------------------|----------|---------|-------------|
| `OSM_TRANSPORT` | `--transport` | `stdio` | Transport mode: `stdio` or `http` |
| `OSM_HTTP_PORT` | `--port` | `3000` | HTTP server port |
| `OSM_USER_AGENT` | - | `osm-tools-mcp/1.0.0` | User-Agent for API requests |
| `OSM_THROTTLE_MS` | - | `1000` | Delay between API requests (ms) |
| `OSM_NOMINATIM_URL` | - | `https://nominatim.openstreetmap.org` | Nominatim API URL |
| `OSM_OVERPASS_URL` | - | `https://overpass-api.de/api/interpreter` | Overpass API URL |
| `OSM_OSRM_URL` | - | `https://router.project-osrm.org` | OSRM API URL |

## Tools

### geocode

Forward geocoding: search for a location by address or place name.

**Input:**
```json
{
  "query": "Empire State Building, New York",
  "bbox": [-74.1, 40.7, -73.9, 40.8],
  "country": "US"
}
```

**Output:**
```json
{
  "ok": true,
  "data": [
    {
      "lat": 40.7484,
      "lon": -73.9857,
      "display_name": "Empire State Building, 350, 5th Avenue, Manhattan, New York, NY 10118, USA",
      "type": "attraction",
      "importance": 0.825,
      "place_id": 123456
    }
  ],
  "meta": {
    "source": "nominatim",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### reverse_geocode

Reverse geocoding: get address from coordinates.

**Input:**
```json
{
  "lat": 40.7484,
  "lon": -73.9857
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "lat": 40.7484,
    "lon": -73.9857,
    "display_name": "Empire State Building, 350, 5th Avenue, Manhattan, New York, NY 10118, USA",
    "address": {
      "house_number": "350",
      "road": "5th Avenue",
      "city": "New York",
      "state": "New York",
      "postcode": "10118",
      "country": "United States",
      "country_code": "us"
    },
    "place_id": 123456
  },
  "meta": {
    "source": "nominatim",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### poi_search

Search for Points of Interest using OpenStreetMap Overpass API.

**Input (with bbox):**
```json
{
  "center_or_bbox": {
    "bbox": [40.7, -74.1, 40.8, -73.9]
  },
  "tags": {
    "amenity": "restaurant",
    "cuisine": "italian"
  },
  "limit": 10
}
```

**Input (with center point, 1km radius):**
```json
{
  "center_or_bbox": {
    "center": [40.7484, -73.9857]
  },
  "tags": {
    "amenity": "cafe"
  }
}
```

**Output:**
```json
{
  "ok": true,
  "data": [
    {
      "id": 123456789,
      "name": "Little Italy Restaurant",
      "lat": 40.7195,
      "lon": -73.9973,
      "tags": {
        "amenity": "restaurant",
        "cuisine": "italian",
        "name": "Little Italy Restaurant"
      },
      "type": "node"
    }
  ],
  "meta": {
    "source": "overpass",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### route

Calculate a route between two points using OSRM.

**Input:**
```json
{
  "start": [40.7128, -74.006],
  "end": [40.7484, -73.9857],
  "mode": "walking"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "distance_km": 4.2,
    "duration_minutes": 52,
    "geometry": "encoded_polyline_string",
    "steps": [
      {
        "instruction": "Depart",
        "distance_m": 150,
        "duration_s": 108,
        "name": "Broadway"
      },
      {
        "instruction": "Turn right",
        "distance_m": 500,
        "duration_s": 360,
        "name": "5th Avenue"
      },
      {
        "instruction": "Arrive at destination",
        "distance_m": 0,
        "duration_s": 0,
        "name": ""
      }
    ],
    "summary": "Broadway, 5th Avenue"
  },
  "meta": {
    "source": "osrm",
    "retrieved_at": "2024-01-15T12:00:00.000Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "osm-tools": {
      "command": "node",
      "args": ["/path/to/osm-tools/dist/cli.js"]
    }
  }
}
```

## API Usage Policies

This server uses public OpenStreetMap APIs. Please respect their usage policies:

- **Nominatim**: Max 1 request per second, include proper User-Agent
- **Overpass**: Be mindful of query complexity and frequency
- **OSRM**: Public demo server has rate limits

The server includes built-in throttling (default 1000ms between requests) to comply with these policies.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## License

MIT
