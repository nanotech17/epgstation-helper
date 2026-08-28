import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';

test('loads required and optional environment settings', () => {
  assert.deepEqual(loadConfig({
    EPGSTATION_BASE_URL: 'https://epgstation.example.test:8888/',
    HOST: '0.0.0.0',
    PORT: '4000',
    PROGRAM_DAYS: '5',
    NODE_ENV: 'production',
  }), {
    epgBaseUrl: 'https://epgstation.example.test:8888',
    host: '0.0.0.0',
    port: 4000,
    programDays: 5,
    isProduction: true,
  });
});

test('uses safe defaults for optional environment settings', () => {
  const config = loadConfig({ EPGSTATION_BASE_URL: 'http://127.0.0.1:8888' });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.programDays, 7);
  assert.equal(config.isProduction, false);
});

test('requires the EPGStation base URL', () => {
  assert.throws(() => loadConfig({}), /EPGSTATION_BASE_URL is required/);
});

test('accepts only HTTP or HTTPS EPGStation URLs', () => {
  assert.throws(
    () => loadConfig({ EPGSTATION_BASE_URL: 'file:///tmp/epgstation' }),
    /must use http or https/,
  );
  assert.throws(
    () => loadConfig({ EPGSTATION_BASE_URL: 'not-a-url' }),
    /must be a valid URL/,
  );
});

test('validates numeric environment settings', () => {
  const base = { EPGSTATION_BASE_URL: 'http://127.0.0.1:8888' };
  assert.throws(() => loadConfig({ ...base, PORT: '0' }), /PORT must be between 1 and 65535/);
  assert.throws(() => loadConfig({ ...base, PORT: '3000.5' }), /PORT must be an integer/);
  assert.throws(() => loadConfig({ ...base, PROGRAM_DAYS: '8' }), /PROGRAM_DAYS must be between 1 and 7/);
});
