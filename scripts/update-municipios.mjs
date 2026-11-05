// Atualiza public/municipios-ibge.json a partir da relação de municípios do IBGE
// redistribuída por kelvins/municipios-brasileiros (licença MIT).
//   node scripts/update-municipios.mjs [municipios.json estados.json]
// Sem argumentos, baixa os dois arquivos do repositório de origem.
import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/';
async function load(name, path) {
  const text = path ? await readFile(path, 'utf8') : await (await fetch(source + name)).text();
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}
const [municipalities, states] = await Promise.all([
  load('municipios.json', process.argv[2]),
  load('estados.json', process.argv[3])
]);
// A UF sai dos dois primeiros dígitos do código IBGE (public/municipality-catalog.js).
const ufs = Object.fromEntries(states.map(state => [String(state.codigo_uf), state.uf]));
const rows = municipalities
  .map(m => ({ id: String(m.codigo_ibge), name: m.nome.trim(), capital: Boolean(m.capital) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
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
