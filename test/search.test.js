import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUERY_FIELDS,
  matchesQuery,
  normalizeQueryFields,
  parseQueryTerms,
} from '../src/search.js';

const program = {
  name: '夏の新ドラマ 第１話',
  description: '若手俳優が主演する青春物語',
  extended: '舞台は北海道。特別インタビュー付き。',
};

test('defaults missing and empty query fields to both fields', () => {
  assert.deepEqual(normalizeQueryFields(undefined), DEFAULT_QUERY_FIELDS);
  assert.deepEqual(normalizeQueryFields([]), DEFAULT_QUERY_FIELDS);
});

test('normalizes query fields and removes unsupported or duplicate values', () => {
  assert.deepEqual(
    normalizeQueryFields(['description', 'unknown', 'description']),
    ['description'],
  );
});

test('searches only the program name when name is selected', () => {
  assert.equal(matchesQuery(program, parseQueryTerms('ドラマ'), 'AND', ['name']), true);
  assert.equal(matchesQuery(program, parseQueryTerms('青春'), 'AND', ['name']), false);
});

test('searches description and extended text when description is selected', () => {
  assert.equal(matchesQuery(program, parseQueryTerms('青春'), 'AND', ['description']), true);
  assert.equal(matchesQuery(program, parseQueryTerms('北海道'), 'AND', ['description']), true);
  assert.equal(matchesQuery(program, parseQueryTerms('ドラマ'), 'AND', ['description']), false);
});

test('searches across both selected fields while preserving AND and OR modes', () => {
  const fields = ['name', 'description'];
  assert.equal(matchesQuery(program, parseQueryTerms('ドラマ 青春'), 'AND', fields), true);
  assert.equal(matchesQuery(program, parseQueryTerms('ドラマ 該当なし'), 'AND', fields), false);
  assert.equal(matchesQuery(program, parseQueryTerms('該当なし 北海道'), 'OR', fields), true);
});

test('normalizes width and letter case for partial matches', () => {
  assert.equal(matchesQuery(program, parseQueryTerms('第1話'), 'AND', ['name']), true);
  assert.equal(matchesQuery({ name: 'EPGStation' }, parseQueryTerms('station'), 'AND', ['name']), true);
});
