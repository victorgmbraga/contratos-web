import { assert } from '../errors.js';
import { openOptionsDatabase } from './options-db.js';

export const FILTER_OPTIONS_TTL = 4 * 60 * 60 * 1000;
export const FILTER_OPTIONS_PREFIX = 'contratos-web:filter-options:v1:';
const DB_MARKER = 'contratos-web:filter-options:db:v1';
const COMPRESSION_THRESHOLD = 64 * 1024;

async function encodeEntry(entry) {
  const text = JSON.stringify(entry.value);
  if (
    text.length < COMPRESSION_THRESHOLD ||
    typeof CompressionStream !== 'function' ||
    typeof DecompressionStream !== 'function'
  )
    return entry;
  const bytes = new Uint8Array(
    await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  );
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { ...entry, encoding: 'gzip-base64', value: btoa(binary) };
}

async function decodeValue(entry) {
  if (entry.encoding === undefined) return normalizeResult(entry.value);
  assert(
    entry.encoding === 'gzip-base64' && typeof entry.value === 'string' && typeof DecompressionStream === 'function',
    'INVALID_UPSTREAM',
    'Formato de cache de opções inválido.'
  );
  const bytes = Uint8Array.from(atob(entry.value), character => character.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return normalizeResult(JSON.parse(text));
}

function normalizeResult(result) {
  const filters = result?.filters;
  assert(
    filters && typeof filters === 'object' && !Array.isArray(filters) && Object.keys(filters).length > 0,
    'INVALID_UPSTREAM',
    'O PNCP não forneceu listas válidas de opções.'
  );
  for (const options of Object.values(filters)) {
    assert(
      Array.isArray(options) &&
        options.every(
          option =>
            option &&
            typeof option.id === 'string' &&
            option.id !== '' &&
            typeof option.label === 'string' &&
            (option.active === undefined || typeof option.active === 'boolean')
        ),
      'INVALID_UPSTREAM',
      'Opções de filtro inválidas.'
    );
  }
  const warnings = result.warnings ?? [],
    partial = result.partial_domains ?? [];
  assert(
    Array.isArray(warnings) &&
      warnings.every(warning => warning && typeof warning.message === 'string') &&
      Array.isArray(partial) &&
      partial.every(name => typeof name === 'string') &&
      (result.domain_source === undefined || typeof result.domain_source === 'string'),
    'INVALID_UPSTREAM',
    'Metadados de opções inválidos.'
  );
  // Keep only normalized lists and presentation metadata, not duplicate raw responses.
  // O chamador recebe uma cópia isolada em get(); aqui evitamos uma segunda clonagem.
  return {
    filters,
    warnings,
    partial_domains: partial,
    ...(result.domain_source ? { domain_source: result.domain_source } : {})
  };
}

function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      }
    );
  });
}

export function createFilterOptionsCache(
  service,
  schema,
  { getStorage = () => globalThis.localStorage, now = Date.now, indexedDB = globalThis.indexedDB } = {}
) {
  let storage;
  try {
    storage = getStorage();
  } catch {
    /* Storage may be blocked by the browser. */
  }
  let database = null,
    databasePromise = null,
    closed = false;
  function databaseReady() {
    if (closed) return Promise.resolve(null);
    if (!databasePromise) {
      const opening = openOptionsDatabase(indexedDB, {
        onClose: () => {
          if (databasePromise === opening) {
            database = null;
            databasePromise = null;
          }
        }
      })
        .then(db => {
          if (closed) {
            db?.close();
            return null;
          }
          if (databasePromise === opening) database = db;
          return db;
        })
        .catch(() => null);
      databasePromise = opening;
    }
    return databasePromise;
  }
  const prefix = `${FILTER_OPTIONS_PREFIX}${schema.source}:${schema.api_version}:`;
  const memory = new Map(),
    pending = new Map(),
    queue = [],
    controller = new AbortController();
  let active = false;

  function describe({ type, field = null, normatives }, priority = 'background') {
    assert(
      schema.document_types.some(document => document.enabled && document.id === type),
      'INVALID_DOMAIN',
      'Tipo de documento inválido para opções.'
    );
    const cap =
      field === null
        ? null
        : schema.capabilities.find(
            capability =>
              capability.name === field &&
              capability.domain &&
              capability.documents.includes(type) &&
              !capability.reserved
          );
    assert(field === null || cap, 'INVALID_DOMAIN', 'Filtro incompatível com o documento.');
    const provider = cap?.domain_source ?? 'search';
    const dependent = provider === 'search' && (field === null || field === 'amparos_legais');
    assert(
      normatives === undefined ||
        (Array.isArray(normatives) && normatives.every(id => typeof id === 'string' && /^\d+$/.test(id))),
      'INVALID_DOMAIN',
      'Normativos inválidos.'
    );
    const selected = dependent ? [...new Set(normatives ?? [])].sort() : [];
    const key =
      prefix +
      encodeURIComponent(JSON.stringify(provider === 'search' ? [provider, type, selected] : [provider, field]));
    return {
      key,
      payload: {
        type,
        field: provider === 'search' ? (selected.length ? 'amparos_legais' : null) : field,
        ...(selected.length ? { normatives: selected } : {}),
        priority
      }
    };
  }

  function discard(key) {
    memory.delete(key);
    try {
      storage?.removeItem?.(key);
    } catch {
      /* An in-memory cache still works. */
    }
    database?.delete(key).catch(() => {});
  }
  function pruneExpiredStorage() {
    if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const storedKey = storage.key(i);
      if (storedKey?.startsWith(FILTER_OPTIONS_PREFIX)) keys.push(storedKey);
    }
    const time = now();
    for (const storedKey of keys) {
      try {
        const parsed = JSON.parse(storage.getItem(storedKey) || '');
        if (!Number.isSafeInteger(parsed?.expires_at) || parsed.expires_at <= time) storage.removeItem?.(storedKey);
      } catch {
        try {
          storage.removeItem?.(storedKey);
        } catch {}
      }
    }
  }
  async function persist(key, entry) {
    controller.signal.throwIfAborted();
    if (storage) {
      let encoded;
      try {
        encoded = JSON.stringify(await encodeEntry(entry));
      } catch {}
      controller.signal.throwIfAborted();
      if (encoded !== undefined) {
        try {
          storage.setItem(key, encoded);
          return;
        } catch {
          pruneExpiredStorage();
          try {
            storage.setItem(key, encoded);
            return;
          } catch {
            try {
              storage.removeItem?.(key);
            } catch {}
            try {
              storage.setItem(DB_MARKER, '1');
            } catch {
              /* The marker is best effort. */
            }
          }
        }
      }
    }
    controller.signal.throwIfAborted();
    try {
      const db = database || (await databaseReady());
      if (db && !closed) await db.set(key, entry);
    } catch {
      /* The in-memory cache still works. */
    }
  }
  async function read(key) {
    let entry = memory.get(key),
      fromLocalStorage = false,
      checkDatabase = !storage;
    if (!entry && storage) {
      let text;
      try {
        text = storage.getItem(key);
        if (!text) checkDatabase = storage.getItem(DB_MARKER) === '1';
      } catch {
        storage = null;
        checkDatabase = true;
      }
      if (text) {
        try {
          entry = JSON.parse(text);
          fromLocalStorage = true;
        } catch {
          try {
            storage?.removeItem?.(key);
          } catch {}
        }
      }
    }
    if (!entry && checkDatabase) {
      try {
        const db = database || (await databaseReady());
        if (db) entry = await db.get(key);
      } catch {
        entry = null;
      }
    }
    if (!entry) return null;
    try {
      const time = now();
      assert(
        entry.version === 1 &&
          Number.isSafeInteger(entry.fetched_at) &&
          entry.fetched_at >= 0 &&
          entry.fetched_at <= time &&
          entry.expires_at === entry.fetched_at + FILTER_OPTIONS_TTL &&
          time < entry.expires_at,
        'EXPIRED_OPTIONS',
        'Opções expiradas.'
      );
      const value = await decodeValue(entry);
      assert(
        !value.warnings.some(warning => warning.code === 'INVALID_DOMAIN_OPTIONS' && warning.domain === 'anos'),
        'EXPIRED_OPTIONS',
        'Atualize as opções de ano fornecidas pelo PNCP.'
      );
      const normalized = { version: 1, fetched_at: entry.fetched_at, expires_at: entry.expires_at, value };
      // Upgrade large legacy localStorage entries without querying PNCP or extending their TTL.
      if (fromLocalStorage && entry.encoding === undefined && JSON.stringify(value).length >= COMPRESSION_THRESHOLD)
        await persist(key, normalized);
      assert(now() < entry.expires_at, 'EXPIRED_OPTIONS', 'Opções expiradas.');
      memory.set(key, normalized);
      return value;
    } catch {
      discard(key);
      return null;
    }
  }
  function pump() {
    if (active || !queue.length || controller.signal.aborted) return;
    active = true;
    let index = queue.findIndex(item => item.priority === 'foreground');
    if (index < 0) index = 0;
    const job = queue.splice(index, 1)[0];
    Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        active = false;
        pump();
      });
  }
  function load(key, payload, priority) {
    const existing = pending.get(key);
    if (existing) {
      if (priority === 'foreground' && existing.job) {
        existing.job.priority = 'foreground';
        existing.payload.priority = 'foreground';
      }
      return existing.promise;
    }
    let job;
    const promise = new Promise((resolve, reject) => {
      job = {
        priority,
        resolve,
        reject,
        async run() {
          controller.signal.throwIfAborted();
          const value = normalizeResult(await service.call('domains', payload, { signal: controller.signal }));
          controller.signal.throwIfAborted();
          const fetched = now(),
            entry = { version: 1, fetched_at: fetched, expires_at: fetched + FILTER_OPTIONS_TTL, value };
          await persist(key, entry);
          controller.signal.throwIfAborted();
          memory.set(key, entry);
          return value;
        }
      };
      queue.push(job);
    }).finally(() => pending.delete(key));
    pending.set(key, { promise, job, payload });
    pump();
    return promise;
  }
  /**
   * @param {any} payload
   * @param {{signal?: AbortSignal, priority?: 'foreground' | 'background'}} [options]
   */
  async function get(payload, { signal, priority = 'background' } = {}) {
    signal?.throwIfAborted();
    controller.signal.throwIfAborted();
    const { key, payload: request } = describe(payload, priority),
      cached = await read(key);
    signal?.throwIfAborted();
    controller.signal.throwIfAborted();
    const value = cached ?? (await waitFor(load(key, request, priority), signal));
    signal?.throwIfAborted();
    return structuredClone(value);
  }
  async function preload() {
    const documents = schema.document_types.filter(document => document.enabled);
    const requests = documents.map(document => ({ type: document.id }));
    for (const cap of schema.capabilities.filter(
      cap => cap.domain && !cap.reserved && ['catalog', 'reference'].includes(cap.domain_source)
    )) {
      const document = documents.find(document => cap.documents.includes(document.id));
      if (document) requests.push({ type: document.id, field: cap.name });
    }
    const results = [];
    // Migrate cached entries before loading the next type, freeing storage quota.
    for (const request of requests) results.push(...(await Promise.allSettled([get(request)])));
    return results;
  }
  function close() {
    closed = true;
    controller.abort(new DOMException('Carregamento de opções encerrado.', 'AbortError'));
    for (const job of queue.splice(0)) job.reject(controller.signal.reason);
    database?.close();
  }
  return { get, preload, close };
}
