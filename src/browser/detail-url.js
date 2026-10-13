import { assert } from '../errors.js';
import { validateDocument } from '../validation.js';
import { documentResources } from '../document-details.js';

export const detailTabs = type => ['detalhes', ...(type === 'edital' ? ['itens'] : []), ...documentResources[type]];

export function detailDocumentPath(document) {
  assert(document && Object.hasOwn(documentResources, document.type), 'INVALID_URL_PARAMETERS', 'Tipo do documento de detalhes inválido.');
  validateDocument(document);
  return [document.type, document.cnpj, document.ano, ...(document.type === 'ata' ? [BigInt(document.sequencial_compra).toString()] : []), BigInt(document.sequencial).toString()].join('/');
}

export function readDetailUrl(href) {
  const params = new URL(href).searchParams;
  for (const name of ['detalhe', 'aba']) assert(params.getAll(name).length <= 1, 'INVALID_URL_PARAMETERS', 'O parâmetro ' + name + ' não pode ser repetido.');
  if (!params.has('detalhe')) {
    assert(!params.has('aba'), 'INVALID_URL_PARAMETERS', 'O parâmetro aba exige um documento em detalhe.');
    return null;
  }
  const parts = params.get('detalhe').split('/'), type = parts[0];
  assert(Object.hasOwn(documentResources, type) && parts.length === (type === 'ata' ? 5 : 4), 'INVALID_URL_PARAMETERS', 'Identificação do documento em detalhe inválida.');
  const document = { type, cnpj: parts[1], ano: parts[2], sequencial: parts.at(-1), ...(type === 'ata' ? { sequencial_compra: parts[3] } : {}) };
  detailDocumentPath(document);
  document.sequencial = BigInt(document.sequencial).toString();
  if (type === 'ata') document.sequencial_compra = BigInt(document.sequencial_compra).toString();
  const tab = params.get('aba') ?? 'detalhes';
  assert(detailTabs(type).includes(tab), 'INVALID_URL_PARAMETERS', 'Aba indisponível para este tipo de documento.');
  return { document, tab };
}

export function writeDetailUrl(href, selection) {
  const url = new URL(href);
  url.searchParams.delete('detalhe');url.searchParams.delete('aba');
  if (selection) {
    const path = detailDocumentPath(selection.document);
    assert(detailTabs(selection.document.type).includes(selection.tab), 'INVALID_URL_PARAMETERS', 'Aba indisponível para este tipo de documento.');
    url.searchParams.set('detalhe', path);url.searchParams.set('aba', selection.tab);
  }
  return url.href;
}
