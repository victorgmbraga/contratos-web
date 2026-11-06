import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';

// Buscas prontas (as mesmas pesquisas dos scripts de extração do PNCP, em editais) e buscas que
// o usuário salva neste navegador. Uma busca é guardada como os parâmetros da URL da consulta:
// a leitura passa pela mesma validação de um link compartilhado.

/** @typedef {{ id: string, name: string, terms: string[], filters: Record<string, string> }} Preset */

// As buscas prontas ficam em search-presets.json (asset com hash, baixado ao abrir o painel), fora do
// JavaScript inicial: as listas de termos são a maior parte do seu tamanho.
const valid = value => typeof value === 'string' && value.trim().length > 0;
/** @param {unknown} data @returns {Preset[]} */
export function parsePresets(data) {
  const presets = /** @type {any} */ (data)?.presets;
  if (
    !Array.isArray(presets) ||
    !presets.every(
      preset =>
        valid(preset?.id) &&
        valid(preset.name) &&
        Array.isArray(preset.terms) &&
        preset.terms.length > 0 &&
        preset.terms.every(valid) &&
        preset.filters &&
        typeof preset.filters === 'object' &&
        Object.values(preset.filters).every(valid)
    )
  )
    throw new Error('Buscas prontas inválidas.');
  return presets.map(({ id, name, terms, filters }) => ({ id, name, terms: [...terms], filters: { ...filters } }));
}
export function fetchPresets(fetcher = globalThis.fetch) {
  return async () => {
    const response = await fetcher(new URL('./search-presets.json', import.meta.url));
    if (!response.ok) throw new Error('Não foi possível carregar as buscas prontas.');
    return parsePresets(await response.json());
  };
}

/** Termos de várias palavras vão entre aspas; todos se combinam com OR. */
export const presetText = preset => preset.terms.map(term => (term.includes(' ') ? `"${term}"` : term)).join(' OR ');

const BASE = 'https://saved.invalid/';
/** @returns {string} Parâmetros da consulta (sem a página), como na URL. */
export function querySearch(query, schema) {
  const url = new URL(writeQueryUrl(BASE, { ...query, page: 1 }, schema));
  url.searchParams.delete('pagina');
  return url.search;
}
export function readSearch(search, schema, size) {
  return readQueryUrl(BASE + search, schema, size);
}
export function presetSearch(preset) {
  return '?' + new URLSearchParams({ tipos_documento: 'edital', q: presetText(preset), ...preset.filters });
}

const TYPE_LABELS = { edital: 'Editais', ata: 'Atas', contrato: 'Contratos' };
/** Resumo curto de uma busca: tipo, texto ou quantidade de termos e filtros. */
export function describeQuery(query) {
  const parts = [TYPE_LABELS[query.document_type] || query.document_type];
  const terms = query.q.split(' OR ').length;
  if (terms > 1) parts.push(`${terms} termos`);
  else if (query.q) parts.push(query.q.length > 40 ? `“${query.q.slice(0, 40)}…”` : `“${query.q}”`);
  const filters = Object.keys(query.pncp_filters).length + (query.status === 'todos' ? 0 : 1);
  if (filters) parts.push(`${filters} ${filters === 1 ? 'filtro' : 'filtros'}`);
  return parts.join(' · ');
}

export const SAVED_SEARCHES_KEY = 'contratos-web:saved-searches:v1';
export const MAX_SAVED_SEARCHES = 30;
const MAX_NAME = 60;

/** Buscas salvas neste navegador, mais recentes primeiro; armazenamento indisponível mantém a sessão. */
export function createSavedSearches(getStorage = () => globalThis.localStorage) {
  let storage;
  try {
    storage = getStorage();
  } catch {
    /* Armazenamento bloqueado: mantém a sessão. */
  }
  /** @type {{ name: string, search: string }[]} */
  let entries = [];
  const valid = entry =>
    entry &&
    typeof entry.name === 'string' &&
    entry.name.trim() &&
    entry.name.length <= MAX_NAME &&
    typeof entry.search === 'string' &&
    entry.search.startsWith('?') &&
    entry.search.length <= 4000;
  function read() {
    if (!storage) return;
    try {
      const raw = JSON.parse(storage.getItem(SAVED_SEARCHES_KEY) ?? '[]');
      if (!Array.isArray(raw) || raw.length > MAX_SAVED_SEARCHES || !raw.every(valid)) throw new Error('Inválido');
      entries = raw.map(({ name, search }) => ({ name, search }));
    } catch {
      entries = [];
      try {
        storage.removeItem(SAVED_SEARCHES_KEY);
      } catch {
        /* Falhas de armazenamento não bloqueiam a busca. */
      }
    }
  }
  function write() {
    try {
      storage?.setItem(SAVED_SEARCHES_KEY, JSON.stringify(entries));
    } catch {
      storage = undefined;
    }
  }
  read();
  return {
    list() {
      read();
      return entries.map(entry => ({ ...entry }));
    },
    /** Salva com o nome informado; um nome já usado é substituído. */
    save(name, search) {
      const entry = { name: String(name).trim().slice(0, MAX_NAME), search };
      if (!valid(entry)) return false;
      read();
      entries = [entry, ...entries.filter(item => item.name !== entry.name)].slice(0, MAX_SAVED_SEARCHES);
      write();
      return true;
    },
    remove(name) {
      read();
      entries = entries.filter(item => item.name !== name);
      write();
    }
  };
}

/**
 * Monta as listas do painel de buscas (#search-help).
 * @param {{ document: Document, window: Window, schema: any, size: number, current: () => any,
 *   run: (query: any) => unknown, loadPresets?: () => Promise<Preset[]> }} options
 */
export function initializeSearchLibrary({
  document,
  window,
  schema,
  size,
  current,
  run,
  loadPresets = fetchPresets((input, init) => window.fetch(input, init))
}) {
  const describe = describeQuery;
  const $ = id => document.getElementById(id);
  const panel = $('search-help'),
    presets = $('search-presets'),
    saved = $('saved-searches'),
    form = $('save-search-form'),
    name = /** @type {HTMLInputElement} */ ($('save-search-name')),
    status = $('save-search-status');
  if (!panel || !presets || !saved || !form) return null;
  const store = createSavedSearches(() => window.localStorage);
  const close = () => panel.matches?.(':popover-open') && panel.hidePopover();
  function choice(label, note, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-library-choice';
    const title = document.createElement('span');
    title.className = 'search-library-name';
    title.textContent = label;
    const detail = document.createElement('span');
    detail.className = 'search-library-note';
    detail.textContent = note;
    button.append(title, detail);
    button.addEventListener('click', () => {
      close();
      run(onClick());
    });
    return button;
  }
  /** @type {Promise<void> | null} */
  let presetsLoading = null;
  function note(text) {
    const item = document.createElement('li');
    item.className = 'search-library-message';
    item.textContent = text;
    presets.replaceChildren(item);
  }
  // Baixadas na primeira abertura; uma falha permite tentar de novo ao reabrir o painel.
  function renderPresets() {
    presetsLoading ??= (async () => {
      note('Carregando buscas prontas…');
      try {
        const list = await loadPresets();
        presets.replaceChildren();
        for (const preset of list) {
          let query;
          try {
            query = readSearch(presetSearch(preset), schema, size);
          } catch {
            continue;
          }
          const item = document.createElement('li');
          item.append(choice(preset.name, describe(query), () => readSearch(presetSearch(preset), schema, size)));
          presets.append(item);
        }
      } catch {
        presetsLoading = null;
        note('Não foi possível carregar as buscas prontas. Feche e abra o painel para tentar de novo.');
      }
    })();
    return presetsLoading;
  }
  function renderSaved() {
    saved.replaceChildren();
    const entries = store.list();
    $('saved-searches-empty').hidden = entries.length > 0;
    for (const entry of entries) {
      let query;
      try {
        query = readSearch(entry.search, schema, size);
      } catch {
        continue; // Busca salva por uma versão anterior que não é mais válida.
      }
      const item = document.createElement('li'),
        remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'search-library-remove';
      remove.setAttribute('aria-label', `Remover a busca ${entry.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        store.remove(entry.name);
        renderSaved();
        status.textContent = `Busca “${entry.name}” removida.`;
        name.focus();
      });
      item.append(
        choice(entry.name, describe(query), () => readSearch(entry.search, schema, size)),
        remove
      );
      saved.append(item);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = current(),
      label = name.value.trim() || query.q.slice(0, MAX_NAME) || 'Busca sem texto';
    if (store.save(label, querySearch(query, schema))) {
      name.value = '';
      renderSaved();
      status.textContent = `Busca “${label}” salva neste navegador.`;
    } else status.textContent = 'Não foi possível salvar a busca.';
  });
  panel.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') {
      void renderPresets();
      renderSaved();
      status.textContent = '';
    }
  });
  renderSaved();
  return { renderSaved, renderPresets };
}
