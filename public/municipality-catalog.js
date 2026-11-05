// Relação oficial de municípios do IBGE, usada nos filtros de município em vez das sugestões do
// PNCP: o PNCP só sugere a partir de três caracteres, e estes filtros usam o código IBGE.
// A relação é um asset com hash (cache longo e Service Worker), baixada só quando um filtro de
// município é usado; a busca local fica em municipality-search.js.
import * as municipalitySearch from './municipality-search.js';

/** Filtros cujo identificador é o código IBGE do município. */
export const MUNICIPALITY_FIELDS = ['municipios', 'municipios_fornecedor'];

/** @typedef {import('./municipality-search.js').Municipality} Municipality */

/**
 * Carrega a relação uma única vez por página; uma falha permite tentar de novo.
 * @param {() => Promise<unknown>} loadData
 * @param {() => Promise<typeof import('./municipality-search.js')>} [loadSearch]
 */
export function createMunicipalityCatalog(loadData, loadSearch = async () => municipalitySearch) {
  /** @type {Promise<Municipality[]> | null} */
  let pending = null;
  /** @type {Map<string, Municipality> | null} */
  let byId = null;
  /** @type {Municipality[] | null} */
  let list = null;
  /** @type {typeof import('./municipality-search.js') | null} */
  let engine = null;
  return {
    load() {
      pending ??= Promise.all([Promise.resolve().then(loadData), loadSearch()])
        .then(([data, module]) => {
          const items = module.parseMunicipalityCatalog(data);
          engine = module;
          list = items;
          byId = new Map(items.map(item => [item.id, item]));
          return items;
        })
        .catch(error => {
          pending = null;
          throw error;
        });
      return pending;
    },
    /** Lista já carregada, ou null. */
    get list() {
      return list;
    },
    /** @param {string} id */
    get(id) {
      return byId?.get(id);
    },
    /**
     * Busca na relação já carregada (ver searchMunicipalities).
     * @param {string} query
     * @param {{ ufs?: string[], limit?: number }} [options]
     */
    search(query, options) {
      if (!engine || !list) return { total: 0, items: [] };
      return engine.searchMunicipalities(list, query, options);
    }
  };
}

/** Busca na relação carregada pelo navegador, a partir do arquivo publicado com a aplicação. */
export function fetchMunicipalityCatalog(fetcher = globalThis.fetch) {
  return async () => {
    const response = await fetcher(new URL('./municipios-ibge.json', import.meta.url));
    if (!response.ok) throw new Error('Não foi possível carregar a relação de municípios.');
    return response.json();
  };
}
