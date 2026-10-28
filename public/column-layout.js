/** @typedef {import('../types/contracts.js').ColumnLayout} ColumnLayout */
/** @typedef {import('../types/contracts.js').StorageLike} StorageLike */
// Visibilidade, ordem e largura das colunas são persistidas por tipo documental.
export const COLUMN_LAYOUT_PREFIX = 'contratos-web:columns:v1:';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value @returns {value is ColumnLayout} */
function validLayout(value) {
  return record(value) && Array.isArray(value.order) && value.order.every(field => typeof field === 'string' && field.length > 0)
    && record(value.visible) && Object.values(value.visible).every(visible => typeof visible === 'boolean')
    && record(value.width) && Object.values(value.width).every(width => typeof width === 'number' && Number.isFinite(width) && width > 0);
}

/** @param {{window: {readonly localStorage?: StorageLike}, state: {query: Pick<import('../types/contracts.js').SearchQuery, 'document_type'> | null}}} options */
export function createColumnLayout({window, state}) {
  /** @returns {StorageLike | null} */
  function storageArea() { try { return window.localStorage ?? null; } catch { return null; } }
  /** @param {string} type */
  function clearColumnLayout(type) { try { storageArea()?.removeItem(COLUMN_LAYOUT_PREFIX + type); } catch { /* O armazenamento pode estar bloqueado. */ } }
  /** @param {string} type @returns {ColumnLayout | null} */
  function readColumnLayout(type) {
    try {
      const raw = storageArea()?.getItem(COLUMN_LAYOUT_PREFIX + type);
      if (!raw) return null;
      const value = /** @type {unknown} */ (JSON.parse(raw));
      if (validLayout(value)) return value;
    } catch { /* Preferências inválidas ou indisponíveis usam o layout padrão. */ }
    clearColumnLayout(type);
    return null;
  }
  /** @param {import('../types/contracts.js').ColumnPreference[]} columns */
  function saveColumnLayout(columns) {
    const type = state.query?.document_type;
    if (!type) return;
    const layout = {order: columns.map(column => column.field), visible: Object.fromEntries(columns.map(column => [column.field, column.visible])), width: Object.fromEntries(columns.map(column => [column.field, column.width]))};
    if (!validLayout(layout)) return;
    try { storageArea()?.setItem(COLUMN_LAYOUT_PREFIX + type, JSON.stringify(layout)); }
    catch { /* O layout continua válido nesta página, mesmo sem persistência. */ }
  }
  return {read: readColumnLayout, save: saveColumnLayout, clear: clearColumnLayout};
}
