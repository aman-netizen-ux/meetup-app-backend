import 'dotenv/config';

const apiKey = process.env.GEOAPIFY_API_KEY;
if (!apiKey) throw new Error('Set GEOAPIFY_API_KEY locally before running the routing spike.');

const routes = [
  { id: 'local-metro', label: 'Ramagondanahalli to Kadugodi Tree Park', waypoints: '12.9558969,77.7405826|12.9856503,77.7470121' },
  { id: 'city-centre', label: 'Ramagondanahalli to Mahatma Gandhi Road', waypoints: '12.9558969,77.7405826|12.9755264,77.6067902' },
] as const;
const modes = ['walk', 'drive', 'transit', 'approximated_transit'] as const;

interface RouteStep {
  mode?: string;
  instruction?: { text?: string };
  name?: string;
  distance?: number;
  time?: number;
  [key: string]: unknown;
}
interface RouteLeg {
  distance?: number;
  time?: number;
  steps?: RouteStep[];
  [key: string]: unknown;
}
interface RouteResult {
  distance?: number;
  time?: number;
  legs?: RouteLeg[];
  [key: string]: unknown;
}
interface RoutingResponse { results?: RouteResult[] }

function textValues(
  value: unknown,
  path = '',
  output: Array<{ path: string; value: string }> = [],
): Array<{ path: string; value: string }> {
  if (typeof value === 'string' && /stop|station|platform|route|line|agency|departure|arrival/i.test(path)) {
    output.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => textValues(item, `${path}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => textValues(item, path ? `${path}.${key}` : key, output));
  }
  return output.slice(0, 30);
}

const output = [];
for (const route of routes) {
  for (const mode of modes) {
    const url = new URL('https://api.geoapify.com/v1/routing');
    url.search = new URLSearchParams({
      waypoints: route.waypoints,
      mode,
      format: 'json',
      lang: 'en',
      details: 'instruction_details',
      ...(mode === 'drive' ? { traffic: 'approximated' } : {}),
      apiKey,
    }).toString();
    const startedAt = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const latencyMs = Date.now() - startedAt;
    const responseText = await response.text();
    if (!response.ok) {
      let errorMessage: string | null = null;
      try {
        const errorBody = JSON.parse(responseText) as { message?: unknown; error?: unknown };
        if (typeof errorBody.message === 'string') errorMessage = errorBody.message;
        else if (typeof errorBody.error === 'string') errorMessage = errorBody.error;
      } catch {
        errorMessage = null;
      }
      output.push({ route: route.id, label: route.label, mode, available: false,
        httpStatus: response.status, latencyMs, responseBytes: Buffer.byteLength(responseText),
        error: errorMessage });
      continue;
    }
    const results = (JSON.parse(responseText) as RoutingResponse).results ?? [];
    output.push({
      route: route.id,
      label: route.label,
      mode,
      available: results.length > 0,
      httpStatus: response.status,
      latencyMs,
      responseBytes: Buffer.byteLength(responseText),
      results: results.map((result) => ({
        distanceMeters: result.distance ?? null,
        durationSeconds: result.time ?? null,
        legs: (result.legs ?? []).map((leg) => ({
          distanceMeters: leg.distance ?? null,
          durationSeconds: leg.time ?? null,
          stepCount: leg.steps?.length ?? 0,
          stepModes: [...new Set((leg.steps ?? []).map((step) => step.mode).filter(Boolean))],
          namedSteps: (leg.steps ?? []).filter((step) => step.name || step.instruction?.text).slice(0, 12)
            .map((step) => ({ mode: step.mode ?? null, name: step.name ?? null,
              instruction: step.instruction?.text ?? null,
              distanceMeters: step.distance ?? null, durationSeconds: step.time ?? null })),
        })),
        transitMetadata: textValues(result),
      })),
    });
  }
}

process.stdout.write(`${JSON.stringify({ testedAt: new Date().toISOString(), output }, null, 2)}\n`);
