export const RECENT_FILTER_OPTIONS_KEY = 'contratos-web:filter-recents:v1';
export const RECENT_OPTIONS_PER_FIELD = 8;
const MAX_FIELDS = 40;

// Opções escolhidas recentemente nos filtros com sugestão, por campo e mais recentes primeiro.
// São atalhos de apresentação neste navegador; a consulta continua usando apenas os IDs.
export function createRecentFilterOptions(getStorage = () => globalThis.localStorage) {
  /** @type {Map<string, { id: string, label: string }[]>} */
  let fields = new Map();
  let storage;
  try {
    storage = getStorage();
  } catch {
    /* Armazenamento bloqueado: mantém a sessão. */
  }
  const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
  function read() {
    // Sem armazenamento utilizável, as escolhas ficam só na memória desta página.
    if (!storage) return;
    let text;
    try {
      text = storage.getItem(RECENT_FILTER_OPTIONS_KEY);
    } catch {
      storage = undefined;
      return;
    }
    try {
      const raw = JSON.parse(text ?? '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Cache inválido');
      const entries = Object.entries(raw);
      if (entries.length > MAX_FIELDS) throw new Error('Cache inválido');
      const next = new Map();
      for (const [field, options] of entries) {
        if (!valid(field) || !Array.isArray(options) || options.length > RECENT_OPTIONS_PER_FIELD)
          throw new Error('Cache inválido');
        if (!options.every(option => Array.isArray(option) && option.length === 2 && option.every(valid)))
          throw new Error('Opção inválida');
        const seen = new Set(),
          items = [];
        for (const [id, label] of options) {
          if (seen.has(id)) continue;
          seen.add(id);
          items.push({ id, label });
        }
        next.set(field, items);
      }
      fields = next;
    } catch {
      fields = new Map();
      try {
        storage.removeItem?.(RECENT_FILTER_OPTIONS_KEY);
      } catch {
        /* Falhas de cache não bloqueiam filtros. */
      }
    }
  }
  read();
  return {
    /** @param {string} field */
    list(field) {
      read();
      return (fields.get(field) || []).map(item => ({ ...item }));
    },
    /** @param {string} field @param {{ id: unknown, label: unknown }} option */
    add(field, option) {
      if (!option || typeof option !== 'object' || option.id == null || option.label == null) return;
      const id = String(option.id),
        label = String(option.label);
      if (!valid(field) || !valid(id) || !valid(label)) return;
      // Preserva o que outras abas gravaram antes de atualizar este campo.
      read();
      const options = [{ id, label }, ...(fields.get(field) || []).filter(item => item.id !== id)];
      fields.delete(field);
      fields.set(field, options.slice(0, RECENT_OPTIONS_PER_FIELD));
      while (fields.size > MAX_FIELDS) fields.delete(fields.keys().next().value);
      try {
        storage?.setItem(
          RECENT_FILTER_OPTIONS_KEY,
          JSON.stringify(
            Object.fromEntries([...fields].map(([name, items]) => [name, items.map(o => [o.id, o.label])]))
          )
        );
      } catch {
        // Quota ou bloqueio: deixa de reler o armazenamento para não perder as escolhas da sessão.
        storage = undefined;
      }
    }
  };
}
