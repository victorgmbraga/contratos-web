// Leitura e busca local da relação de municípios do IBGE (ver public/municipality-catalog.js).

export const MUNICIPALITY_RESULTS_LIMIT = 50;

/** @typedef {{ id: string, label: string, name: string, uf: string, capital: boolean, text: string }} Municipality */

export const normalizeSearchText = value =>
  String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** @param {unknown} data @returns {Municipality[]} */
export function parseMunicipalityCatalog(data) {
  const source = /** @type {{ ufs?: unknown, capitais?: unknown, municipios?: unknown }} */ (data ?? {});
  const ufs = source.ufs;
  if (!ufs || typeof ufs !== 'object' || !Array.isArray(source.municipios) || !Array.isArray(source.capitais))
    throw new Error('Relação de municípios inválida.');
  const capitals = new Set(source.capitais);
  return source.municipios.map(entry => {
    const match = typeof entry === 'string' ? /^(\d{7})(\D.*)$/.exec(entry) : null;
    const uf = match && /** @type {Record<string, unknown>} */ (ufs)[match[1].slice(0, 2)];
    if (!match || typeof uf !== 'string') throw new Error('Relação de municípios inválida.');
    const [, id, name] = match;
    return { id, label: `${name}/${uf}`, name, uf, capital: capitals.has(id), text: normalizeSearchText(name) };
  });
}

/**
 * Sem texto, mostra os municípios das UFs escolhidas ou, sem UF, as capitais. Com texto, nomes que
 * começam pelo termo vêm antes dos que têm uma palavra iniciada por ele e dos que apenas o contêm;
 * o termo também pode incluir a UF ("bom jesus pi"). As UFs escolhidas têm prioridade.
 * @param {Municipality[]} list
 * @param {string} query
 * @param {{ ufs?: string[], limit?: number }} [options]
 */
export function searchMunicipalities(list, query, { ufs = [], limit = MUNICIPALITY_RESULTS_LIMIT } = {}) {
  const preferred = new Set(ufs);
  const text = normalizeSearchText(query);
  /** @type {{ item: Municipality, rank: number }[]} */
  const found = [];
  for (const item of list) {
    let rank;
    if (!text) rank = preferred.size ? (preferred.has(item.uf) ? 0 : -1) : item.capital ? 0 : -1;
    else {
      const withUf = `${item.text} ${item.uf.toLowerCase()}`;
      if (item.text.startsWith(text) || withUf.startsWith(text)) rank = 0;
      else if (item.text.includes(' ' + text) || withUf.includes(' ' + text)) rank = 1;
      else if (withUf.includes(text)) rank = 2;
      else rank = -1;
    }
    if (rank < 0) continue;
    found.push({ item, rank: rank * 2 + (preferred.size && !preferred.has(item.uf) ? 1 : 0) });
  }
  // A lista já vem em ordem alfabética; a ordenação estável a preserva dentro de cada faixa.
  found.sort((a, b) => a.rank - b.rank);
  return { total: found.length, items: found.slice(0, limit).map(({ item }) => item) };
}
