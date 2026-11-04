export const FILTER_LABELS_KEY = 'contratos-web:filter-labels:v1';
const MAX_LABELS = 1000;

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
    try {
      const entries = JSON.parse(storage?.getItem(FILTER_LABELS_KEY) ?? '[]');
      if (!Array.isArray(entries) || entries.length > MAX_LABELS) throw new Error('Cache inválido');
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string')
          throw new Error('Rótulo inválido');
        const key = JSON.parse(entry[0]);
        if (
          !Array.isArray(key) ||
          key.length !== 3 ||
          !key.every(value => typeof value === 'string' && value.length > 0)
        )
          throw new Error('Chave inválida');
      }
      for (const [key, label] of entries) labels.set(key, label);
    } catch {
      try {
        storage?.removeItem(FILTER_LABELS_KEY);
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
      // Preserva seleções gravadas por outras abas antes de atualizar esta entrada.
      read();
      labels.delete(key);
      labels.set(key, label);
      while (labels.size > MAX_LABELS) labels.delete(labels.keys().next().value);
      try {
        storage?.setItem(FILTER_LABELS_KEY, JSON.stringify([...labels]));
      } catch {
        /* Quota: mantém a sessão. */
      }
    }
  };
}
