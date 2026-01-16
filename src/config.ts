/**
 * Configuration management for OSM Tools MCP Server
 */

export interface Config {
  httpPort: number;
  userAgent: string;
  throttleMs: number;
  nominatimUrl: string;
  overpassUrl: string;
  osrmUrl: string;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  return {
    httpPort: getEnvNumber('OSM_HTTP_PORT', 8080),
    userAgent: getEnv('OSM_USER_AGENT', 'osm-tools-mcp/1.0.0'),
    throttleMs: getEnvNumber('OSM_THROTTLE_MS', 1000),
    nominatimUrl: getEnv('OSM_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
    overpassUrl: getEnv('OSM_OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
    osrmUrl: getEnv('OSM_OSRM_URL', 'https://router.project-osrm.org'),
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function setConfig(config: Partial<Config>): void {
  configInstance = { ...getConfig(), ...config };
}

// Throttling implementation
let lastRequestTime = 0;

export async function throttle(): Promise<void> {
  const config = getConfig();
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < config.throttleMs) {
    const delay = config.throttleMs - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

/**
 * Make an HTTP request with proper headers and throttling
 */
export async function fetchWithThrottle(
  url: string,
  options: RequestInit = {}
): Promise<globalThis.Response> {
  await throttle();

  const config = getConfig();
  const headers = new Headers(options.headers);

  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', config.userAgent);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
