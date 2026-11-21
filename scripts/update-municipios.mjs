// Atualiza public/municipios-ibge.json a partir da relação de municípios do IBGE
// redistribuída por kelvins/municipios-brasileiros (licença MIT).
//   node scripts/update-municipios.mjs [municipios.json estados.json]
// Sem argumentos, baixa os dois arquivos do repositório de origem.
import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/';
if (Boolean(process.argv[2]) !== Boolean(process.argv[3]))
  throw new Error('Informe ambos os arquivos (municipios.json e estados.json) ou nenhum.');
async function load(name, path) {
  if (path) return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  const response = await fetch(source + name, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Falha ao baixar ${name}: HTTP ${response.status}`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/, ''));
}
const [municipalities, states] = await Promise.all([
  load('municipios.json', process.argv[2]),
  load('estados.json', process.argv[3])
]);
if (!Array.isArray(states) || !Array.isArray(municipalities))
  throw new Error('Arquivos de entrada devem conter listas JSON.');
// A UF sai dos dois primeiros dígitos do código IBGE (public/municipality-catalog.js).
const ufs = {};
for (const state of states) {
  const code = String(state?.codigo_uf ?? ''),
    uf = typeof state?.uf === 'string' ? state.uf.trim() : '';
  if (!/^\d{2}$/.test(code) || !/^[A-Z]{2}$/.test(uf) || Object.hasOwn(ufs, code))
    throw new Error(`Estado inválido: ${code} (${uf})`);
  ufs[code] = uf;
}
if (Object.keys(ufs).length !== 27) throw new Error(`Esperava 27 UFs, encontrei ${Object.keys(ufs).length}.`);
const rows = municipalities
  .map(m => ({
    id: String(m?.codigo_ibge ?? ''),
    name: typeof m?.nome === 'string' ? m.nome.trim() : '',
    capital: m?.capital === 1 || m?.capital === true
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
if (rows.length <= 5000) throw new Error(`Quantidade inesperada de municípios: ${rows.length}.`);
for (const { id, name } of rows)
  if (!/^\d{7}$/.test(id) || !name || /^\d/.test(name) || !ufs[id.slice(0, 2)])
    throw new Error(`Município inválido: ${id}`);
if (new Set(rows.map(({ id }) => id)).size !== rows.length) throw new Error('Códigos IBGE repetidos.');
await writeFile(
  new URL('../public/municipios-ibge.json', import.meta.url),
  JSON.stringify({
    fonte: 'IBGE, via kelvins/municipios-brasileiros (MIT)',
    ufs,
    capitais: rows.filter(row => row.capital).map(row => row.id),
    municipios: rows.map(row => row.id + row.name)
  }) + '\n'
);
console.log(`${rows.length} municípios gravados.`);
