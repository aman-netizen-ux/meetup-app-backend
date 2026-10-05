import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import { SearchPlaces } from '../dist/src/modules/places/application/search_places.js';
import { registerPlacesRoutes } from '../dist/src/modules/places/presentation/places_routes.js';

const user = { id: 'test-user' };
const auth = { execute: async (header) => header === 'Bearer valid' ? user : null };

test('place search requires auth and keeps provider data behind one response shape', async () => {
  const app = Fastify({ logger: false });
  const queries = [];
  registerPlacesRoutes(app, auth, new SearchPlaces({
    async search(query) {
      queries.push(query);
      return [{ label: 'Cafe', secondaryLabel: 'Bengaluru', latitude: 12.97, longitude: 77.72, placeId: 'place-1' }];
    },
  }));
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/places/search', payload: {query: 'cafe'} })).statusCode, 401);
    const short = await app.inject({ method: 'POST', url: '/v1/places/search', payload: {query: 'ca'}, headers: { authorization: 'Bearer valid' } });
    assert.deepEqual(short.json().items, []);
    const found = await app.inject({ method: 'POST', url: '/v1/places/search', payload: {query: ' cafe '}, headers: { authorization: 'Bearer valid' } });
    assert.equal(found.statusCode, 200);
    assert.equal(found.json().items[0].placeId, 'place-1');
    const repeated = await app.inject({ method: 'POST', url: '/v1/places/search', payload: {query: 'CAFE'}, headers: { authorization: 'Bearer valid' } });
    assert.equal(repeated.statusCode, 200);
    assert.deepEqual(queries, ['cafe']);
  } finally { await app.close(); }
});

test('unconfigured place search returns a stable unavailable error', async () => {
  const app = Fastify({ logger: false });
  registerPlacesRoutes(app, auth, null);
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/places/search', payload: {query: 'cafe'}, headers: { authorization: 'Bearer valid' } });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'PLACE_SEARCH_UNAVAILABLE');
  } finally { await app.close(); }
});
