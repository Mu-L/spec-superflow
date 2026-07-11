import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReleaseCheckArgs,
  verifyMarketplaceRelease,
} from '../../scripts/verify-marketplace-release.mjs';

const response = ({ ok = true, status = 200, body = { version: '0.9.0' } } = {}) => ({
  ok,
  status,
  async json() { return body; },
});

describe('verify marketplace release', () => {
  it('accepts a matching HTTPS manifest version', async () => {
    const result = await verifyMarketplaceRelease({
      manifestUrl: 'https://example.test/plugin.json',
      expectedVersion: '0.9.0',
      fetchImpl: async () => response(),
    });
    assert.equal(result.actualVersion, '0.9.0');
  });

  it('rejects HTTP, malformed, network, and version-drift responses', async () => {
    await assert.rejects(
      () => verifyMarketplaceRelease({
        manifestUrl: 'https://example.test/plugin.json',
        expectedVersion: '0.9.0',
        fetchImpl: async () => response({ ok: false, status: 404 }),
      }),
      /HTTP 404/,
    );
    await assert.rejects(
      () => verifyMarketplaceRelease({
        manifestUrl: 'https://example.test/plugin.json',
        expectedVersion: '0.9.0',
        fetchImpl: async () => response({ body: { name: 'spec-superflow' } }),
      }),
      /missing a string version/,
    );
    await assert.rejects(
      () => verifyMarketplaceRelease({
        manifestUrl: 'https://example.test/plugin.json',
        expectedVersion: '0.9.0',
        fetchImpl: async () => { throw new Error('socket closed'); },
      }),
      /network request failed: socket closed/,
    );
    await assert.rejects(
      () => verifyMarketplaceRelease({
        manifestUrl: 'https://example.test/plugin.json',
        expectedVersion: '0.9.0',
        fetchImpl: async () => response({ body: { version: '0.8.17' } }),
      }),
      /expected 0.9.0, found 0.8.17/,
    );
  });

  it('requires one HTTPS URL and one complete semver argument', () => {
    assert.throws(() => parseReleaseCheckArgs([]), /Usage:/);
    assert.throws(
      () => parseReleaseCheckArgs([
        '--manifest-url', 'http://example.test/plugin.json',
        '--expected-version', '0.9.0',
      ]),
      /HTTPS/,
    );
    assert.throws(
      () => parseReleaseCheckArgs([
        '--manifest-url', 'https://example.test/plugin.json',
        '--expected-version', '0.9',
      ]),
      /x\.y\.z/,
    );
  });
});
