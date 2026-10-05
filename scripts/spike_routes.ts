import 'dotenv/config';

const apiKey = process.env.GOOGLE_MAPS_API_KEY;
const origin = process.env.ROUTE_ORIGIN;
const destination = process.env.ROUTE_DESTINATION;

if (!apiKey || !origin || !destination) {
  throw new Error(
    'Set GOOGLE_MAPS_API_KEY, ROUTE_ORIGIN, and ROUTE_DESTINATION in .env. See docs/routing-spike.md.',
  );
}

const fieldMask = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.duration',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.transitDetails',
].join(',');

for (const travelMode of ['WALK', 'DRIVE', 'TRANSIT'] as const) {
  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode,
    computeAlternativeRoutes: true,
    ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
  };
  const response = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`${travelMode} route request failed with HTTP ${response.status}.`);
  }

  const result = await response.json() as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      legs?: Array<{ steps?: Array<{
        travelMode?: string;
        duration?: string;
        transitDetails?: { stopDetails?: {
          departureStop?: { name?: string };
          arrivalStop?: { name?: string };
        } };
      }> }>;
    }>;
  };
  const summary = (result.routes ?? []).map((route) => ({
    duration: route.duration,
    distanceMeters: route.distanceMeters,
    steps: (route.legs ?? []).flatMap((leg) => (leg.steps ?? []).map((step) => ({
      mode: step.travelMode,
      duration: step.duration,
      departureStop: step.transitDetails?.stopDetails?.departureStop?.name,
      arrivalStop: step.transitDetails?.stopDetails?.arrivalStop?.name,
    }))),
  }));
  process.stdout.write(`${travelMode}: ${JSON.stringify(summary, null, 2)}\n`);
}
