import { AppError, assert } from './errors.js';
import { validateQuery } from './validation.js';
import { project, plain } from './adapter.js';
import { delay, operation } from './operation.js';
import { documentNames } from './schema.js';
import { documentResources } from './document-details.js';

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
const childResources = ['termos', 'empenhos', 'instrumentocobranca'];

function documentIdentity(doc) {
  return (
    doc._document || (doc.tipo_documento === 'edital' && doc._purchase ? { type: 'edital', ...doc._purchase } : null)
  );
}
function checkDuplicates(documents) {
  const searchIds = new Set(),
    nativeIds = new Set();
  for (const doc of documents) {
    const identity = documentIdentity(doc);
    const nativeId =
      identity &&
      [
        identity.type,
        identity.cnpj,
        identity.ano,
        BigInt(identity.sequencial),
        identity.type === 'ata' ? BigInt(identity.sequencial_compra) : ''
      ].join('/');
    assert(
      !searchIds.has(doc._identity) && !nativeIds.has(nativeId),
      'SOURCE_CHANGED',
      'O PNCP retornou um documento duplicado. Repita a consulta.',
      409,
      {},
      true
    );
    if (doc._identity) searchIds.add(doc._identity);
    if (nativeId) nativeIds.add(nativeId);
  }
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
  const config = service.config;
  const op = operation(
    { ...config, PNCP_OPERATION_TIMEOUT_SECONDS: config.PNCP_FULL_EXPORT_TIMEOUT_SECONDS },
    signal,
    requestId
  );
  function checkBudget(used, limit, code, message) {
    if (used > limit) op.cancel(new AppError(code, message, 422, { limit }));
    op.check();
  }
  const budget = {
    reserveRequest() {
      checkBudget(
        ++op.requests,
        config.PNCP_MAX_FULL_EXPORT_REQUESTS,
        'FULL_EXPORT_REQUEST_LIMIT',
        'Limite de chamadas da exportação completa excedido. Delimite a pesquisa.'
      );
    },
    consumeBytes(bytes) {
      op.bytes += bytes;
      checkBudget(
        op.bytes,
        config.PNCP_MAX_FULL_EXPORT_BYTES,
        'FULL_EXPORT_RESPONSE_BYTES_LIMIT',
        'Limite de dados recebidos do PNCP para a exportação completa excedido. Delimite a pesquisa.'
      );
    }
  };
  try {
    return await collectExport(service, input, op, budget, onProgress, now);
  } finally {
    op.finish(true);
  }
}

async function collectExport(service, input, exportOp, budget, onProgress, now) {
  const config = service.config,
    query = validateQuery({ ...input, page: 1, size: PAGE_SIZE }, config);
  const { id: requestId, signal } = exportOp;
  let serial = 0;
  const nextId = () => `${requestId}:${++serial}`;
  const op = operation(config, signal, requestId, 'foreground', budget);
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
  checkDuplicates(documents);
  const encoder = new TextEncoder();
  let done = 0,
    files = 0,
    links = 0,
    errors = 0,
    bytes = 0;
  function encode(text) {
    exportOp.check();
    const chunk = encoder.encode(text);
    bytes += chunk.byteLength;
    assert(
      bytes <= config.PNCP_MAX_FULL_EXPORT_BYTES,
      'FULL_EXPORT_BYTES_LIMIT',
      'Limite de tamanho do JSON da exportação completa excedido. Delimite a pesquisa.',
      422,
      { limit: config.PNCP_MAX_FULL_EXPORT_BYTES }
    );
    return chunk;
  }
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
      entry.detalhes = withoutEnvelope(plain(await service.documentDetails(identity, signal, nextId(), budget)));
    });
    if (type === 'edital')
      await guard(entry, 'itens', async () => {
        const items = await service.collectItems(identity, PAGE_SIZE, signal, nextId(), budget);
        for (const item of items)
          if (item.temResultado === true && Number.isSafeInteger(item.numeroItem) && item.numeroItem > 0)
            await guard(entry, `itens/${item.numeroItem}/resultados`, async () => {
              item.resultados = plain(
                await service.itemResults(identity, item.numeroItem, signal, nextId(), budget)
              ).data;
            });
        entry.itens = items;
      });
    for (const resource of documentResources[type]) {
      await guard(entry, resource, async () => {
        const records = plain(
          await pages((page, mode) =>
            service.documentRelated(identity, resource, page, RELATED_PAGE_SIZE, signal, nextId(), mode, budget)
          )
        );
        entry.listagens[resource] = records;
        if (resource === 'arquivos') entry.arquivos.push(...records.map(record => fileRecord('arquivos', record)));
        if (type === 'contrato' && childResources.includes(resource))
          for (const record of records) {
            if (!record.sequencial) continue;
            await guard(entry, `${resource}/${record.sequencial}`, async () => {
              const child = plain(
                await service.contractChild(identity, resource, record.sequencial, signal, nextId(), budget)
              );
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

  // Os blocos ocupam a posição da busca, mesmo quando os documentos terminam fora de ordem.
  const chunks = new Array(documents.length + 2);
  chunks[chunks.length - 1] = encode('\n]}\n');
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(documents.length, Math.max(1, config.PNCP_MAX_CONCURRENT_REQUESTS)) }, async () => {
      while (cursor < documents.length) {
        const index = cursor++;
        const entry = await collect(documents[index], index);
        files += entry.arquivos.length;
        links += entry.arquivos.filter(file => file.url).length;
        errors += entry.erros.length;
        chunks[index + 1] = encode((index ? ',\n' : '\n') + JSON.stringify(entry));
        done++;
        progress();
        await delay(0, signal);
      }
    })
  );
  exportOp.check();

  const generatedAt = now().toISOString();
  const metadata = {
    ...searchMetadata,
    started_at: exportOp.started_at,
    finished_at: generatedAt,
    elapsed_ms: Date.now() - exportOp.started,
    upstream_requests: exportOp.requests,
    export_scope: 'full',
    exported_rows: done,
    files_total: files,
    files_with_url: links,
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
    resumo: { documentos: done, arquivos: files, links_disponiveis: links, erros: errors },
    observacoes: [
      'Os dados foram consultados no PNCP durante a exportação e podem diferir da tabela.',
      'Os arquivos não são baixados; a lista "arquivos" de cada documento traz o link público de download no PNCP.'
    ]
  };
  // Os totais do cabeçalho só são conhecidos depois de codificar os documentos.
  chunks[0] = encode(JSON.stringify(json).slice(0, -1) + ',"documentos":[');
  exportOp.check();
  return { chunks, metadata };
}
