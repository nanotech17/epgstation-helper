export const DEFAULT_QUERY_FIELDS = Object.freeze(['name', 'description']);

export function normalizeQueryFields(value) {
  if (!Array.isArray(value)) return [...DEFAULT_QUERY_FIELDS];

  const fields = [...new Set(value.filter((field) => DEFAULT_QUERY_FIELDS.includes(field)))];
  return fields.length > 0 ? fields : [...DEFAULT_QUERY_FIELDS];
}

export function matchesQuery(program, terms, mode, queryFields = DEFAULT_QUERY_FIELDS) {
  const fields = normalizeQueryFields(queryFields);
  const searchParts = [];

  if (fields.includes('name')) searchParts.push(program.name || '');
  if (fields.includes('description')) {
    searchParts.push(program.description || '', program.extended || '');
  }

  const haystack = normalizeSearchText(searchParts.join('\n'));
  if (mode === 'OR') return terms.some((term) => haystack.includes(term));
  return terms.every((term) => haystack.includes(term));
}

export function parseQueryTerms(query) {
  return normalizeSearchText(query)
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function normalizeSearchText(value) {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP');
}
