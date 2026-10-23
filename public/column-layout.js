// Visibilidade, ordem e largura das colunas são persistidas por tipo documental.
export const COLUMN_LAYOUT_PREFIX = 'contratos-web:columns:v1:';
export function createColumnLayout({ window, state }) {
function storageArea() { try { return window.localStorage; } catch { return null; } }
function columnLayoutKey(type) { return COLUMN_LAYOUT_PREFIX + type; }
function readColumnLayout(type) {
  try {
    const raw=storageArea()?.getItem(columnLayoutKey(type));
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value || !Array.isArray(value.order) || typeof value.visible!=='object' || typeof value.width!=='object')return null;
    return value;
  } catch { return null; }
}
function saveColumnLayout(columns) {
  const type=state.query?.document_type;if(!type)return;
  try {
    storageArea()?.setItem(columnLayoutKey(type),JSON.stringify({order:columns.map(column=>column.field),visible:Object.fromEntries(columns.map(column=>[column.field,!!column.visible])),width:Object.fromEntries(columns.map(column=>[column.field,column.width]))}));
  } catch { /* Storage may be blocked; the layout remains valid for this page. */ }
}
function clearColumnLayout(type) { try { storageArea()?.removeItem(columnLayoutKey(type)); } catch { /* Ignore unavailable storage. */ } }
return { read: readColumnLayout, save: saveColumnLayout, clear: clearColumnLayout };
}
