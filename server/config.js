import 'dotenv/config';

export function loadConfig(env = process.env) {
  return Object.freeze({
    epgBaseUrl: readRequiredHttpUrl(env, 'EPGSTATION_BASE_URL'),
    host: readHost(env.HOST),
    port: readInteger(env, 'PORT', 3000, 1, 65535),
    programDays: readInteger(env, 'PROGRAM_DAYS', 7, 1, 7),
    isProduction: env.NODE_ENV === 'production',
  });
}

function readRequiredHttpUrl(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }

  return url.toString().replace(/\/+$/, '');
}

function readHost(value) {
  const host = value?.trim() || '127.0.0.1';
  if (/\s/.test(host)) throw new Error('HOST must not contain whitespace');
  return host;
}

function readInteger(env, name, defaultValue, min, max) {
  const rawValue = env[name]?.trim();
  if (!rawValue) return defaultValue;
  if (!/^\d+$/.test(rawValue)) throw new Error(`${name} must be an integer`);

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}
