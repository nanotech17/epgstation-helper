import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const config = loadConfig();

const app = express();
app.use(express.json({ limit: '1mb' }));

const genreLabels = new Map([
  [0, 'ニュース/報道'],
  [1, 'スポーツ'],
  [2, '情報/ワイドショー'],
  [3, 'ドラマ'],
  [4, '音楽'],
  [5, 'バラエティ'],
  [6, '映画'],
  [7, 'アニメ/特撮'],
  [8, 'ドキュメンタリー/教養'],
  [9, '劇場/公演'],
  [10, '趣味/教育'],
  [11, '福祉'],
  [15, 'その他'],
]);

app.get('/api/config', (_req, res) => {
  res.json({ programDays: config.programDays });
});

app.get('/api/health', async (_req, res, next) => {
  try {
    const version = await epgFetch('/api/version');
    res.json({ ok: true, epgstation: version });
  } catch (error) {
    next(error);
  }
});

app.get('/api/programs', async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    const [schedules, reserveLists] = await Promise.all([
      getSchedules(range.startAt, range.endAt),
      getReserveLists(range.startAt, range.endAt).catch(() => null),
    ]);
    const reserveMap = buildReserveMap(reserveLists);
    const programs = flattenSchedules(schedules, reserveMap);
    const categories = buildCategories(programs);
    res.json({
      range,
      count: programs.length,
      categories,
      programs,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reserves', async (req, res, next) => {
  try {
    const params = new URLSearchParams({
      offset: String(Number(req.query.offset || 0)),
      limit: String(Number(req.query.limit || 500)),
      type: String(req.query.type || 'all'),
      isHalfWidth: 'false',
    });
    const reserves = await epgFetch(`/api/reserves?${params}`);
    res.json(reserves);
  } catch (error) {
    next(error);
  }
});

app.post('/api/reserves', async (req, res, next) => {
  try {
    const programId = Number(req.body?.programId);
    if (!Number.isFinite(programId)) {
      return res.status(400).json({ message: 'programId is required' });
    }
    const result = await epgFetch('/api/reserves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        programId,
        allowEndLack: Boolean(req.body?.allowEndLack ?? false),
      }),
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reserves/:reserveId', async (req, res, next) => {
  try {
    const reserveId = Number(req.params.reserveId);
    if (!Number.isFinite(reserveId)) {
      return res.status(400).json({ message: 'reserveId is required' });
    }
    await epgFetch(`/api/reserves/${reserveId}`, { method: 'DELETE' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Unexpected error',
    status,
    details: error.details,
  });
});

if (config.isProduction) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true, hmr: { host: 'localhost' } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(config.port, config.host, () => {
  console.log(`EPGStation-Helper listening on http://${config.host}:${config.port}`);
});

async function getSchedules(startAt, endAt) {
  const params = new URLSearchParams({
    startAt: String(startAt),
    endAt: String(endAt),
    isHalfWidth: 'false',
    needsRawExtended: 'false',
    GR: 'true',
    BS: 'true',
    CS: 'true',
    SKY: 'true',
  });
  return epgFetch(`/api/schedules?${params}`);
}

async function getReserveLists(startAt, endAt) {
  const params = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt) });
  return epgFetch(`/api/reserves/lists?${params}`);
}

function parseRange(query) {
  const now = Date.now();
  const maxEnd = now + config.programDays * 24 * 60 * 60 * 1000;
  const startAt = Number(query.startAt || now);
  const requestedEndAt = Number(query.endAt || maxEnd);
  const endAt = Math.min(requestedEndAt, maxEnd);
  return {
    startAt: Number.isFinite(startAt) ? startAt : now,
    endAt: Number.isFinite(endAt) ? endAt : maxEnd,
  };
}

function flattenSchedules(schedules, reserveMap) {
  return schedules
    .flatMap((schedule) => {
      const channel = schedule.channel || {};
      return (schedule.programs || []).map((program) => {
        const reserve = reserveMap.get(String(program.id));
        const categoryId = normalizeGenreId(program.genre1);
        return {
          id: program.id,
          programId: program.id,
          channelId: program.channelId,
          channelName: channel.name || '',
          channelType: channel.channelType || '',
          remoteControlKeyId: channel.remoteControlKeyId ?? null,
          startAt: program.startAt,
          endAt: program.endAt,
          durationMin: Math.max(0, Math.round((program.endAt - program.startAt) / 60000)),
          name: program.name || '',
          description: program.description || '',
          extended: program.extended || '',
          isFree: Boolean(program.isFree),
          genre1: program.genre1 ?? null,
          subGenre1: program.subGenre1 ?? null,
          categoryId,
          categoryName: genreLabels.get(categoryId) || '未分類',
          isReserved: Boolean(reserve),
          reserveId: reserve?.reserveId ?? null,
          reserveStatus: reserve?.status ?? null,
          ruleId: reserve?.ruleId ?? null,
        };
      });
    })
    .sort((a, b) => a.startAt - b.startAt || String(a.channelId).localeCompare(String(b.channelId)));
}

function buildCategories(programs) {
  const counts = new Map();
  for (const program of programs) {
    const key = String(program.categoryId ?? 'unknown');
    const current = counts.get(key) || { id: program.categoryId, name: program.categoryName, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'ja'));
}

function buildReserveMap(reserveLists) {
  const map = new Map();
  if (!reserveLists || typeof reserveLists !== 'object') return map;
  const groups = [
    ['normal', 'normal'],
    ['conflicts', 'conflict'],
    ['skips', 'skip'],
    ['overlaps', 'overlap'],
  ];
  for (const [key, status] of groups) {
    const items = normalizeList(reserveLists[key]);
    for (const item of items) {
      if (item?.programId == null) continue;
      map.set(String(item.programId), {
        reserveId: item.reserveId,
        programId: item.programId,
        ruleId: item.ruleId ?? null,
        status,
      });
    }
  }
  return map;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  if (typeof value === 'object' && value.programId != null) return [value];
  return [];
}

async function epgFetch(apiPath, options = {}) {
  const url = `${config.epgBaseUrl}${apiPath}`;
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const payload = parseResponsePayload(text, contentType);
  if (!response.ok) {
    const error = new Error(`EPGStation API error: ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

function parseResponsePayload(text, contentType) {
  if (!text) return null;
  if (!contentType.includes('application/json')) return text;
  try {
    return JSON.parse(text);
  } catch (error) {
    error.message = `Failed to parse EPGStation JSON response: ${error.message}`;
    throw error;
  }
}

function normalizeGenreId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}
