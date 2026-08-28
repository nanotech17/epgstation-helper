import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bookmark, CalendarDays, ChevronDown, Moon, Radio, RefreshCw, Search, Sun, TimerReset, Trash2, Tv, X } from 'lucide-react';
import './styles.css';
import { DEFAULT_QUERY_FIELDS, matchesQuery, normalizeQueryFields, parseQueryTerms } from './search.js';

const FILTER_PRESETS_STORAGE_KEY = 'epgstation-helper.filterPresets';
const QUERY_FIELD_OPTIONS = [
  { id: 'name', label: '番組名' },
  { id: 'description', label: '説明文' },
];

const initialFilters = {
  categoryIds: [],
  dateKeys: [],
  channelIds: [],
  query: '',
  queryMode: 'AND',
  queryFields: [...DEFAULT_QUERY_FIELDS],
};

function App() {
  const [programs, setPrograms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [filterPresets, setFilterPresets] = useState(() => loadFilterPresets());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    loadPrograms();
  }, []);

  const categoryOptions = useMemo(() => categories.map((category) => ({
    id: String(category.id),
    label: category.name,
    count: category.count,
  })), [categories]);
  const dateOptions = useMemo(() => buildDateOptions(programs), [programs]);
  const programsForChannelCounts = useMemo(
    () => applyFilters(programs, { ...filters, channelIds: [] }),
    [programs, filters],
  );
  const channelOptions = useMemo(
    () => buildChannelOptions(programs, programsForChannelCounts),
    [programs, programsForChannelCounts],
  );
  const filteredPrograms = useMemo(() => applyFilters(programs, filters), [programs, filters]);
  const stats = useMemo(() => buildStats(programs, filteredPrograms), [programs, filteredPrograms]);
  const activeFilterCount = countActiveFilters(filters);
  const hasFilterChanges = buildFilterResetKey(filters) !== buildFilterResetKey(initialFilters);

  async function loadPrograms() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/programs');
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setPrograms(data.programs || []);
      setCategories(data.categories || []);
      setRange(data.range || null);
    } catch (err) {
      setError(err.message || '番組情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function reserveProgram(program) {
    setPendingId(program.id);
    setError('');
    try {
      const response = await fetch('/api/reserves', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ programId: program.programId, allowEndLack: false }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      updateProgramReservation(program.id, {
        isReserved: true,
        reserveId: result.reserveId ?? null,
        reserveStatus: 'normal',
        ruleId: null,
      });
    } catch (err) {
      setError(err.message || '録画予約に失敗しました');
    } finally {
      setPendingId(null);
    }
  }

  async function deleteReserve(program) {
    if (!program.reserveId) return;
    setPendingId(program.id);
    setError('');
    try {
      const response = await fetch(`/api/reserves/${program.reserveId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      updateProgramReservation(program.id, {
        isReserved: false,
        reserveId: null,
        reserveStatus: null,
        ruleId: null,
      });
    } catch (err) {
      setError(err.message || '録画予約の削除に失敗しました');
    } finally {
      setPendingId(null);
    }
  }

  function updateProgramReservation(programId, reservationPatch) {
    setPrograms((currentPrograms) =>
      currentPrograms.map((item) => (item.id === programId ? { ...item, ...reservationPatch } : item)),
    );
  }

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleMultiFilter(key, value) {
    setFilters((current) => {
      const values = current[key];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: nextValues };
    });
  }

  function toggleQueryField(field) {
    setFilters((current) => {
      const currentFields = normalizeQueryFields(current.queryFields);
      if (currentFields.includes(field)) {
        if (currentFields.length === 1) return current;
        return { ...current, queryFields: currentFields.filter((item) => item !== field) };
      }
      return { ...current, queryFields: [...currentFields, field] };
    });
  }


  function saveCurrentFilterPreset() {
    const name = window.prompt('プリセット名を入力してください');
    const trimmedName = name?.trim();
    if (!trimmedName) return;

    const nextPresets = saveFilterPreset(filterPresets, {
      id: createPresetId(),
      name: trimmedName,
      filters: normalizeFilters(filters),
      createdAt: Date.now(),
    });
    setFilterPresets(nextPresets);
  }

  function applyFilterPreset(preset) {
    setFilters(normalizeFilters(preset.filters));
  }

  function deleteFilterPreset(presetId) {
    const preset = filterPresets.find((item) => item.id === presetId);
    if (!preset) return;
    if (!window.confirm(`「${preset.name}」を削除しますか？`)) return;
    const nextPresets = removeFilterPreset(filterPresets, presetId);
    setFilterPresets(nextPresets);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Tv size={24} />
          <div>
            <h1>EPGStation-Helper</h1>
            <p>{range ? `${formatDateTime(range.startAt)} - ${formatDateTime(range.endAt)}` : '番組表'}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={loadPrograms} disabled={loading} title="更新">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '通常モード' : 'ダークモード'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="main-layout">
        <aside className="filter-panel" aria-label="フィルタ">
          <div className="filter-title-row">
            <div className="panel-heading">
              <Search size={18} />
              <h2>フィルタ</h2>
            </div>
            <button type="button" className="text-button" onClick={() => setFilters(initialFilters)} disabled={!hasFilterChanges}>
              解除
            </button>
          </div>

          <FilterPresetSection
            presets={filterPresets}
            activeFilterCount={activeFilterCount}
            onSave={saveCurrentFilterPreset}
            onApply={applyFilterPreset}
            onDelete={deleteFilterPreset}
          />

          <FilterSection title="検索語" icon={<Search size={16} />}>
            <input
              className="search-input"
              type="search"
              value={filters.query}
              onChange={(event) => updateFilter({ query: event.target.value })}
              placeholder="キーワードを入力"
              aria-label="検索語"
            />
            <fieldset className="search-fields">
              <legend>検索対象</legend>
              {QUERY_FIELD_OPTIONS.map((field) => {
                const checked = filters.queryFields.includes(field.id);
                const isLastSelected = checked && filters.queryFields.length === 1;
                return (
                  <label className={`search-field-option ${checked ? 'checked' : ''} ${isLastSelected ? 'locked' : ''}`} key={field.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isLastSelected}
                      onChange={() => toggleQueryField(field.id)}
                    />
                    <span>{field.label}</span>
                  </label>
                );
              })}
            </fieldset>
            <div className="mode-toggle" role="group" aria-label="検索条件">
              <button type="button" className={filters.queryMode === 'AND' ? 'active' : ''} onClick={() => updateFilter({ queryMode: 'AND' })}>AND</button>
              <button type="button" className={filters.queryMode === 'OR' ? 'active' : ''} onClick={() => updateFilter({ queryMode: 'OR' })}>OR</button>
            </div>
          </FilterSection>

          <FilterSection title="カテゴリ">
            <DropdownMultiFilter
              label="カテゴリを選択"
              options={categoryOptions}
              selectedIds={filters.categoryIds}
              onToggle={(id) => toggleMultiFilter('categoryIds', id)}
              onSelectAll={() => updateFilter({ categoryIds: categoryOptions.map((category) => category.id) })}
              onClear={() => updateFilter({ categoryIds: [] })}
              summary={buildMultiSummary(filters.categoryIds, categoryOptions, '全カテゴリ')}
              compact
            />
          </FilterSection>

          <FilterSection title="日付" icon={<CalendarDays size={16} />}>
            <DropdownMultiFilter
              label="日付を選択"
              options={dateOptions}
              selectedIds={filters.dateKeys}
              onToggle={(id) => toggleMultiFilter('dateKeys', id)}
              onSelectAll={() => updateFilter({ dateKeys: dateOptions.map((date) => date.id) })}
              onClear={() => updateFilter({ dateKeys: [] })}
              summary={buildMultiSummary(filters.dateKeys, dateOptions, '全日')}
              compact
            />
          </FilterSection>

          <FilterSection title="放送局" icon={<Radio size={16} />}>
            <DropdownMultiFilter
              label="放送局を選択"
              options={channelOptions}
              selectedIds={filters.channelIds}
              onToggle={(id) => toggleMultiFilter('channelIds', id)}
              onSelectAll={() => updateFilter({ channelIds: channelOptions.map((channel) => channel.id) })}
              onClear={() => updateFilter({ channelIds: [] })}
              summary={buildMultiSummary(filters.channelIds, channelOptions, '全局')}
            />
          </FilterSection>
        </aside>

        <section className="content-area">
          <div className="summary-strip">
            <Metric label="表示" value={filteredPrograms.length} />
            <Metric label="全件" value={stats.total} />
            <Metric label="予約済" value={stats.reserved} />
            <Metric label="条件" value={activeFilterCount} />
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button type="button" className="icon-button small" onClick={() => setError('')} title="閉じる">
                <X size={16} />
              </button>
            </div>
          )}

          <ProgramList
            programs={filteredPrograms}
            loading={loading}
            pendingId={pendingId}
            resetKey={buildFilterResetKey(filters)}
            onReserve={reserveProgram}
            onDeleteReserve={deleteReserve}
          />
        </section>
      </main>
    </div>
  );
}


function FilterPresetSection({ presets, activeFilterCount, onSave, onApply, onDelete }) {
  return (
    <section className="filter-section preset-section">
      <div className="filter-section-title">
        <Bookmark size={16} />
        <h3>プリセット</h3>
      </div>
      <button type="button" className="save-preset-button" onClick={onSave} disabled={activeFilterCount === 0}>
        現在の条件を保存
      </button>
      {presets.length > 0 ? (
        <div className="preset-list">
          {presets.map((preset) => (
            <div className="preset-item" key={preset.id}>
              <button type="button" className="preset-apply" onClick={() => onApply(preset)} title={preset.name}>
                {preset.name}
              </button>
              <button type="button" className="preset-delete" onClick={() => onDelete(preset.id)} title="削除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="preset-empty">保存済みなし</div>
      )}
    </section>
  );
}

function FilterSection({ title, icon = null, children }) {
  return (
    <section className="filter-section">
      <div className="filter-section-title">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function MultiFilterOption({ label, count, checked, onChange }) {
  return (
    <label className={`multi-option ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
      <strong>{count}</strong>
    </label>
  );
}


function DropdownMultiFilter({ label, options, selectedIds, onToggle, onSelectAll, onClear, summary, compact = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`dropdown-filter ${open ? 'open' : ''}`}>
      <button type="button" className="dropdown-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>
          <strong>{label}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="dropdown-menu">
          <div className="filter-actions">
            <button type="button" className="mini-button" onClick={onSelectAll}>全選択</button>
            <button type="button" className="mini-button" onClick={onClear}>解除</button>
          </div>
          <div className={`option-list dropdown-options ${compact ? 'compact-list' : ''}`}>
            {options.map((option) => (
              <MultiFilterOption
                key={option.id}
                label={option.label}
                count={option.count}
                checked={selectedIds.includes(option.id)}
                onChange={() => onToggle(option.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramList({ programs, loading, pendingId, resetKey, onReserve, onDeleteReserve }) {
  const scrollerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia('(max-width: 820px)').matches);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    const updateViewport = () => setViewportHeight(element.clientHeight || 620);
    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [loading, programs.length]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setScrollTop(0);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [resetKey]);

  if (loading) {
    return <div className="empty-state">番組情報を取得中です</div>;
  }
  if (programs.length === 0) {
    return <div className="empty-state">表示できる番組がありません</div>;
  }

  const rowHeight = isCompact ? 104 : 42;
  const overscan = isCompact ? 6 : 12;
  const headerHeight = isCompact ? 0 : 34;
  const totalHeight = programs.length * rowHeight;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const visibleEnd = Math.min(programs.length, visibleStart + visibleCount);
  const visiblePrograms = programs.slice(visibleStart, visibleEnd);
  const offsetY = visibleStart * rowHeight;

  return (
    <div className="program-surface">
      <div
        className="program-scroller"
        ref={scrollerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="program-table" role="table" aria-label="番組一覧">
          <div className="table-row table-head" role="row">
            <div>開始</div>
            <div>分</div>
            <div>局</div>
            <div>カテゴリ</div>
            <div>番組</div>
            <div>予約</div>
          </div>
          <div className="virtual-space" style={{ height: totalHeight + headerHeight }}>
            <div className="virtual-window" style={{ transform: `translateY(${offsetY + headerHeight}px)` }}>
              {visiblePrograms.map((program) => (
                <ProgramRow
                  key={`${program.id}-${program.channelId}`}
                  program={program}
                  pending={pendingId === program.id}
                  onReserve={onReserve}
                  onDeleteReserve={onDeleteReserve}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramRow({ program, pending, onReserve, onDeleteReserve }) {
  return (
    <div className={`table-row program-row ${program.isReserved ? 'reserved' : ''}`} role="row">
      <div className="time-cell">
        <strong>{formatTime(program.startAt)}</strong>
        <span>{formatShortDate(program.startAt)}</span>
      </div>
      <div className="duration-cell">
        <TimerReset size={14} />
        <span>{program.durationMin}</span>
      </div>
      <div className="channel-cell" title={program.channelName}>
        <strong>{program.remoteControlKeyId ?? '-'}</strong>
        <span>{program.channelName}</span>
      </div>
      <div className="category-cell">{program.categoryName}</div>
      <div className="title-cell">
        <strong title={program.name}>{program.name}</strong>
        <span title={program.description}>{program.description || program.extended}</span>
      </div>
      <div className="action-cell">
        {program.isReserved ? (
          <button type="button" className="reserve-button active" disabled={pending} onClick={() => onDeleteReserve(program)}>
            {pending ? '処理中' : '予約済'}
          </button>
        ) : (
          <button type="button" className="reserve-button" disabled={pending} onClick={() => onReserve(program)}>
            {pending ? '処理中' : '予約'}
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}



function loadFilterPresets() {
  try {
    const raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((preset) => preset && typeof preset.id === 'string' && typeof preset.name === 'string')
      .map((preset) => ({ ...preset, filters: normalizeFilters(preset.filters) }));
  } catch {
    return [];
  }
}

function saveFilterPreset(currentPresets, preset) {
  const nextPresets = [preset, ...currentPresets].slice(0, 30);
  localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(nextPresets));
  return nextPresets;
}

function removeFilterPreset(currentPresets, presetId) {
  const nextPresets = currentPresets.filter((preset) => preset.id !== presetId);
  localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(nextPresets));
  return nextPresets;
}

function createPresetId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeFilters(value) {
  return {
    categoryIds: Array.isArray(value?.categoryIds) ? value.categoryIds.map(String) : [],
    dateKeys: Array.isArray(value?.dateKeys) ? value.dateKeys.map(String) : [],
    channelIds: Array.isArray(value?.channelIds) ? value.channelIds.map(String) : [],
    query: typeof value?.query === 'string' ? value.query : '',
    queryMode: value?.queryMode === 'OR' ? 'OR' : 'AND',
    queryFields: normalizeQueryFields(value?.queryFields),
  };
}

function buildFilterResetKey(filters) {
  return JSON.stringify({
    categoryIds: filters.categoryIds,
    dateKeys: filters.dateKeys,
    channelIds: filters.channelIds,
    query: filters.query,
    queryMode: filters.queryMode,
    queryFields: normalizeQueryFields(filters.queryFields),
  });
}

function applyFilters(programs, filters) {
  const queryTerms = parseQueryTerms(filters.query);
  return programs.filter((program) => {
    if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(String(program.categoryId))) return false;
    if (filters.dateKeys.length > 0 && !filters.dateKeys.includes(getDateKey(program.startAt))) return false;
    if (filters.channelIds.length > 0 && !filters.channelIds.includes(String(program.channelId))) return false;
    if (queryTerms.length > 0 && !matchesQuery(program, queryTerms, filters.queryMode, filters.queryFields)) return false;
    return true;
  });
}

function buildDateOptions(programs) {
  const counts = new Map();
  for (const program of programs) {
    const id = getDateKey(program.startAt);
    const current = counts.get(id) || { id, label: formatFilterDate(program.startAt), count: 0, startAt: program.startAt };
    current.count += 1;
    counts.set(id, current);
  }
  return [...counts.values()].sort((a, b) => a.startAt - b.startAt);
}

function buildChannelOptions(allPrograms, countPrograms = allPrograms) {
  const counts = new Map();
  for (const program of allPrograms) {
    const id = String(program.channelId);
    if (!counts.has(id)) {
      counts.set(id, {
        id,
        label: formatChannelLabel(program),
        channelType: program.channelType || '',
        remoteControlKeyId: program.remoteControlKeyId ?? 9999,
        count: 0,
      });
    }
  }
  for (const program of countPrograms) {
    const id = String(program.channelId);
    const current = counts.get(id);
    if (current) current.count += 1;
  }
  return [...counts.values()].sort((a, b) => {
    const typeOrder = String(a.channelType).localeCompare(String(b.channelType), 'ja');
    if (typeOrder !== 0) return typeOrder;
    return Number(a.remoteControlKeyId) - Number(b.remoteControlKeyId) || a.label.localeCompare(b.label, 'ja');
  });
}

function formatChannelLabel(program) {
  const parts = [];
  if (program.channelType) parts.push(program.channelType);
  if (program.remoteControlKeyId != null) parts.push(String(program.remoteControlKeyId));
  parts.push(program.channelName || String(program.channelId));
  return parts.join(' ');
}


function buildMultiSummary(selectedIds, options, emptyLabel) {
  if (selectedIds.length === 0) return emptyLabel;
  if (selectedIds.length === options.length) return `すべて選択中 (${selectedIds.length})`;
  if (selectedIds.length === 1) {
    const selected = options.find((option) => option.id === selectedIds[0]);
    return selected?.label || '1件選択中';
  }
  return `${selectedIds.length}件選択中`;
}

function countActiveFilters(filters) {
  let count = 0;
  if (filters.categoryIds.length > 0) count += 1;
  if (filters.dateKeys.length > 0) count += 1;
  if (filters.channelIds.length > 0) count += 1;
  if (parseQueryTerms(filters.query).length > 0) count += 1;
  return count;
}

function buildStats(programs, filteredPrograms) {
  return {
    total: programs.length,
    visible: filteredPrograms.length,
    reserved: filteredPrograms.filter((program) => program.isReserved).length,
  };
}

async function readError(response) {
  try {
    const data = await response.json();
    return data.message || JSON.stringify(data.details || data);
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

function getDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatFilterDate(value) {
  return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

createRoot(document.getElementById('root')).render(<App />);
