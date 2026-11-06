import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { reqHandler } from '../dist/apps/web/server/server.mjs';

const server = createServer(reqHandler);
let origin;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

for (const path of ['/documents', '/documents/1213bf1f-04ad-4163-92d2-c012c1352ab3']) {
  test(`reload ${path} serves the app without redirecting`, async () => {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.match(await response.text(), /<app-root[\s>]/);
  });
}
