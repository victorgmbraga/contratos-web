export const FILTER_LABELS_KEY = 'contratos-web:filter-labels:v1';
const MAX_LABELS = 1000;

function validEntry(key, label) {
  if (typeof key !== 'string' || typeof label !== 'string' || !label) return false;
  try {
    const parsed = JSON.parse(key);
    return Array.isArray(parsed) && parsed.length === 3 && parsed.every(v => typeof v === 'string' && v.length > 0);
  } catch {
    return false;
  }
}

// Rótulos de seleções são metadados de apresentação, não catálogos de opções.
export function createFilterLabelCache(getStorage = () => globalThis.localStorage) {
  const labels = new Map();
  let storage;
  try {
    storage = getStorage();
  } catch {
    /* Armazenamento bloqueado: mantém a sessão. */
  }
  function read() {
    if (!storage) return;
    let raw;
    try {
      raw = storage.getItem(FILTER_LABELS_KEY);
    } catch {
      storage = undefined;
      return;
    }
    try {
      const entries = JSON.parse(raw ?? '[]');
      if (!Array.isArray(entries) || entries.length > MAX_LABELS) throw new Error('Cache inválido');
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || !validEntry(entry[0], entry[1]))
          throw new Error('Rótulo inválido');
      }
      for (const [key, label] of entries) labels.set(key, label);
    } catch {
      try {
        storage.removeItem?.(FILTER_LABELS_KEY);
      } catch {
        /* Falhas de cache não bloqueiam filtros. */
      }
    }
  }
  read();
  return {
    get(key) {
      return labels.get(key);
    },
    set(key, label) {
      if (!validEntry(key, label)) return;
      // Preserva seleções gravadas por outras abas antes de atualizar esta entrada.
      read();
      labels.delete(key);
      labels.set(key, label);
      while (labels.size > MAX_LABELS) labels.delete(labels.keys().next().value);
      try {
        storage?.setItem(FILTER_LABELS_KEY, JSON.stringify([...labels]));
      } catch {
        // Quota ou bloqueio: deixa de reler o armazenamento para preservar a sessão.
        storage = undefined;
      }
    }
  };
}
