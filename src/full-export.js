import { AppError, assert } from './errors.js';
import { validateQuery } from './validation.js';
import { project, plain } from './adapter.js';
import { operation } from './operation.js';
import { documentNames } from './schema.js';

// Exportação completa: os documentos da consulta com tudo o que o painel de detalhes mostra
// (detalhes, itens e resultados, listagens vinculadas e seus registros filhos) num JSON, com os
// links públicos dos arquivos de cada documento. Os arquivos não são baixados: o PNCP envia
// Access-Control-Allow-Origin duplicado nos downloads e o navegador recusa a leitura. Cada
// chamada ao PNCP passa pelo mesmo cliente do Worker, que limita a concorrência e o ritmo.

export const FULL_EXPORT_LIMIT = 100;
export const FULL_EXPORT_FORMAT = 'contratos-web/exportacao-completa';
const PAGE_SIZE = 100;
// Listagens vinculadas: o PNCP recusa páginas de 100 em contratos de uma contratação.
const RELATED_PAGE_SIZE = 50;
const MAX_PAGES = 1000;
export const fullExportSections = {
  edital: ['arquivos', 'atas', 'contratos', 'historico'],
  ata: ['partesenvolvidas', 'contratos', 'arquivos', 'historico'],
  contrato: ['empenhos', 'instrumentocobranca', 'termos', 'arquivos', 'historico']
};
const childResources = ['termos', 'empenhos', 'instrumentocobranca'];

function documentIdentity(doc) {
  return (
    doc._document || (doc.tipo_documento === 'edital' && doc._purchase ? { type: 'edital', ...doc._purchase } : null)
  );
}
const omit = (record, keys) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
const publicFields = doc => Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith('_')));
const withoutEnvelope = result => omit(result, ['api_version', 'request_id', 'upstream_requests', 'source']);
const fileRecord = (origin, record) => ({
  origem: origin,
  titulo: record.titulo,
  tipo: record.tipo,
  data_publicacao: record.data_publicacao,
  url: record.url
});

/**
 * @param {import('./query-core.js').QueryService} service
 * @param {any} input
 * @param {AbortSignal} signal
 * @param {string} requestId
 * @param {{onProgress?: (progress: Record<string, any>) => void, now?: () => Date}} [options]
 */
export async function fullExport(
  service,
  input,
  signal,
  requestId,
  { onProgress = () => {}, now = () => new Date() } = {}
) {
  const config = service.config,
    query = validateQuery({ ...input, page: 1, size: PAGE_SIZE }, config);
  let serial = 0;
  const nextId = () => `${requestId}:${++serial}`;
  const op = operation(config, signal, requestId);
  let head, searchMetadata;
  try {
    await service.verifyDomains(query, op);
    head = await service.client.search(query, 1, PAGE_SIZE, op);
    const fmt = n => new Intl.NumberFormat('pt-BR').format(n);
    assert(
      head.total <= FULL_EXPORT_LIMIT,
      'EXPORT_TOO_BROAD',
      `A busca retornou ${fmt(head.total)} ${documentNames[query.document_type].plural}; a exportação completa aceita até ${FULL_EXPORT_LIMIT}. Delimite a pesquisa por texto, período de publicação, UF ou órgão.`,
      422,
      { source_total: head.total, limit: FULL_EXPORT_LIMIT }
    );
    assert(
      head.items.length === head.total,
      'SOURCE_CHANGED',
      'O PNCP retornou uma quantidade de documentos diferente do total. Repita a consulta.',
      409,
      {},
      true
    );
    searchMetadata = omit(service.metadata(query, [], head.total, op, true), ['data']);
  } finally {
    op.finish();
  }
  const documents = head.items.map(project);
  let done = 0;
  const progress = () => onProgress({ documents: done, total: documents.length });
  progress();

  async function guard(entry, section, task) {
    try {
      return await task();
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error?.name === 'AbortError') throw error;
      entry.erros.push({
        secao: section,
        codigo: error?.code || 'INTERNAL_ERROR',
        mensagem: error instanceof AppError ? error.message : 'Falha inesperada ao consultar o PNCP.'
      });
      return null;
    }
  }
  async function pages(load) {
    const records = [];
    let mode;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await load(page, mode);
      records.push(...result.data);
      if (result.pagination_mode === 'until_empty') mode = 'until_empty';
      if (result.complete || !result.has_more) return records;
    }
    throw new AppError('DETAIL_ITEM_LIMIT', 'Limite de páginas da listagem excedido.', 422);
  }

  async function collect(doc, index) {
    const type = doc.tipo_documento,
      identity = documentIdentity(doc);
    const entry = {
      indice: index + 1,
      tipo_documento: type,
      identificacao: identity,
      documento: publicFields(doc),
      ...(doc._raw ? { registro_busca: doc._raw } : {}),
      detalhes: null,
      ...(type === 'edital' ? { itens: null } : {}),
      listagens: {},
      arquivos: [],
      erros: []
    };
    if (!identity) {
      entry.erros.push({
        secao: 'documento',
        codigo: 'MISSING_IDENTITY',
        mensagem: 'A fonte não forneceu os identificadores originais para consultar os detalhes.'
      });
      return entry;
    }
    await guard(entry, 'detalhes', async () => {
      entry.detalhes = withoutEnvelope(plain(await service.documentDetails(identity, signal, nextId())));
    });
    if (type === 'edital')
      await guard(entry, 'itens', async () => {
        const items = await pages(page => service.details(identity, page, PAGE_SIZE, signal, nextId()));
        for (const item of items)
          if (item.temResultado === true && Number.isSafeInteger(item.numeroItem) && item.numeroItem > 0)
            await guard(entry, `itens/${item.numeroItem}/resultados`, async () => {
              item.resultados = plain(await service.itemResults(identity, item.numeroItem, signal, nextId())).data;
            });
        entry.itens = items;
      });
    for (const resource of fullExportSections[type]) {
      await guard(entry, resource, async () => {
        const records = plain(
          await pages((page, mode) =>
            service.documentRelated(identity, resource, page, RELATED_PAGE_SIZE, signal, nextId(), mode)
          )
        );
        entry.listagens[resource] = records;
        if (resource === 'arquivos') entry.arquivos.push(...records.map(record => fileRecord('arquivos', record)));
        if (type === 'contrato' && childResources.includes(resource))
          for (const record of records) {
            if (!record.sequencial) continue;
            await guard(entry, `${resource}/${record.sequencial}`, async () => {
              const child = plain(await service.contractChild(identity, resource, record.sequencial, signal, nextId()));
              if (child.files) {
                record.arquivos = child.files;
                entry.arquivos.push(...child.files.map(file => fileRecord(`${resource}/${record.sequencial}`, file)));
              } else record.detalhe = child.fields;
            });
          }
      });
    }
    return entry;
  }

  // Dois documentos por vez mantêm a fila do cliente cheia; o limite real de
  // concorrência e de chamadas por segundo continua no cliente compartilhado.
  const entries = new Array(documents.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(documents.length, Math.max(1, config.PNCP_MAX_CONCURRENT_REQUESTS)) }, async () => {
      while (cursor < documents.length) {
        const index = cursor++;
        entries[index] = await collect(documents[index], index);
        done++;
        progress();
      }
    })
  );
  signal.throwIfAborted();

  const generatedAt = now().toISOString(),
    files = entries.reduce((sum, entry) => sum + entry.arquivos.length, 0),
    errors = entries.reduce((sum, entry) => sum + entry.erros.length, 0);
  const metadata = {
    ...searchMetadata,
    finished_at: generatedAt,
    export_scope: 'full',
    exported_rows: entries.length,
    files_total: files,
    errors
  };
  const json = {
    formato: FULL_EXPORT_FORMAT,
    versao: 1,
    gerado_em: generatedAt,
    fonte: 'pncp',
    limite_documentos: FULL_EXPORT_LIMIT,
    consulta: {
      tipo_documento: query.document_type,
      criterios: searchMetadata.effective_filters,
      total: head.total
    },
    resumo: { documentos: entries.length, arquivos: files, erros: errors },
    observacoes: [
      'Os dados foram consultados no PNCP durante a exportação e podem diferir da tabela.',
      'Os arquivos não são baixados; a lista "arquivos" de cada documento traz o link público de download no PNCP.'
    ],
    documentos: entries
  };
  return { chunks: [new TextEncoder().encode(JSON.stringify(json, null, 2))], metadata };
}
