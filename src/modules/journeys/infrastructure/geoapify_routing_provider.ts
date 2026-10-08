import type { JourneyMode } from '../domain/entities/journey_mode.js';
import type { RouteCandidate } from '../domain/entities/route_candidate.js';
import type { RouteCheckpoint } from '../domain/entities/route_checkpoint.js';
import type { RouteLeg } from '../domain/entities/route_leg.js';
import type { RoutePoint } from '../domain/entities/route_point.js';
import type { RoutingProvider } from '../domain/ports/routing_provider.js';
import { PolylineDecoder } from '../domain/polyline_decoder.js';

interface GeoapifyStep {
  distance?: number;
  time?: number;
  from_index?: number;
  instruction?: { text?: string };
}

interface GeoapifyLeg {
  steps?: GeoapifyStep[];
}

interface GeoapifyResult {
  distance?: number;
  time?: number;
  polyline6?: string;
  geometry?: Array<Array<{ lat?: number; lon?: number }>>;
  legs?: GeoapifyLeg[];
}

export class GeoapifyRoutingProvider implements RoutingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly decoder = new PolylineDecoder(),
  ) {}

  async suggest(origin: RoutePoint, destination: RoutePoint): Promise<RouteCandidate[]> {
    const requests = [
      this.request('walk', origin, destination),
      this.request('drive', origin, destination),
      this.request('approximated_transit', origin, destination),
    ];
    const results = await Promise.allSettled(requests);
    return results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []);
  }

  private async request(
    providerMode: 'walk' | 'drive' | 'approximated_transit',
    origin: RoutePoint,
    destination: RoutePoint,
  ): Promise<RouteCandidate | null> {
    const url = new URL('https://api.geoapify.com/v1/routing');
    url.search = new URLSearchParams({
      waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`,
      mode: providerMode,
      format: 'json',
      lang: 'en',
      details: 'polyline6,instruction_details',
      ...(providerMode === 'drive' ? { traffic: 'approximated' } : {}),
      apiKey: this.apiKey,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const body = await response.json() as { results?: GeoapifyResult[] };
    const result = body.results?.[0];
    if (!result || typeof result.distance !== 'number' || typeof result.time !== 'number') {
      return null;
    }
    const mode = this.normalizedMode(providerMode);
    const steps = (result.legs ?? []).flatMap((leg) => leg.steps ?? []);
    const geometry = (result.geometry ?? []).flat();
    return {
      provider: 'geoapify',
      mode,
      label: this.label(providerMode),
      accuracyLabel: this.accuracyLabel(providerMode),
      distanceMeters: Math.round(result.distance),
      durationSeconds: Math.round(result.time),
      encodedPolyline: result.polyline6 ?? null,
      polylinePrecision: result.polyline6 ? 6 : null,
      legs: this.legs(providerMode, steps),
      checkpoints: this.checkpoints(
        providerMode,
        steps,
        geometry.length > 0
          ? geometry
          : this.decoder.decode(result.polyline6 ?? null, result.polyline6 ? 6 : null)
            .map((point) => ({ lat: point.latitude, lon: point.longitude })),
      ),
    };
  }

  private normalizedMode(mode: string): JourneyMode {
    if (mode === 'walk') return 'walk';
    if (mode === 'drive') return 'road';
    return 'transit';
  }

  private label(mode: string): string {
    if (mode === 'walk') return 'Walk there';
    if (mode === 'drive') return 'Road route';
    return 'Estimated public transport';
  }

  private accuracyLabel(mode: string): string {
    if (mode === 'drive') return 'Uses typical traffic patterns, not live congestion';
    if (mode === 'approximated_transit') return 'Estimated route without live schedules';
    return 'Walking estimate';
  }

  private legs(providerMode: string, steps: GeoapifyStep[]): RouteLeg[] {
    if (steps.length === 0) return [];
    const legs: RouteLeg[] = [];
    for (const step of steps) {
      const text = step.instruction?.text ?? this.label(providerMode);
      const mode = providerMode === 'approximated_transit'
        ? (/^(walk|turn|bear|continue|keep)/i.test(text) ? 'walk' : 'transit')
        : this.normalizedMode(providerMode);
      const current = legs.at(-1);
      if (current?.mode === mode) {
        current.distanceMeters += Math.round(step.distance ?? 0);
        current.durationSeconds += Math.round(step.time ?? 0);
      } else {
        legs.push({
          mode,
          label: text,
          distanceMeters: Math.round(step.distance ?? 0),
          durationSeconds: Math.round(step.time ?? 0),
        });
      }
    }
    return legs;
  }

  private checkpoints(
    providerMode: string,
    steps: GeoapifyStep[],
    geometry: Array<{ lat?: number; lon?: number }>,
  ): RouteCheckpoint[] {
    const checkpoints: RouteCheckpoint[] = [];
    let lastMode: JourneyMode | null = null;
    for (const step of steps) {
      const text = step.instruction?.text ?? '';
      const mode = providerMode === 'approximated_transit'
        ? (/^(walk|turn|bear|continue|keep)/i.test(text) ? 'walk' : 'transit')
        : this.normalizedMode(providerMode);
      const point = typeof step.from_index === 'number' ? geometry[step.from_index] : null;
      if (mode !== lastMode && typeof point?.lat === 'number' && typeof point.lon === 'number') {
        checkpoints.push({
          latitude: point.lat,
          longitude: point.lon,
          label: text || `Begin ${mode}`,
          sequence: checkpoints.length,
        });
      }
      lastMode = mode;
    }
    return checkpoints;
  }

}
