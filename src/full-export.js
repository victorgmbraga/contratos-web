import { AppError, assert } from './errors.js';
import { FILE_TIMEOUT_FACTOR } from './pncp-core.js';
import { validateQuery } from './validation.js';
import { project, plain } from './adapter.js';
import { operation } from './operation.js';
import { documentNames } from './schema.js';
import { zipWriter, ZIP_MAX_ENTRIES } from './zip.js';

// Exportação completa: os documentos da consulta com tudo o que o painel de detalhes mostra
// (detalhes, itens e resultados, listagens vinculadas e seus registros filhos) num JSON, e os
// arquivos de cada documento numa pasta própria, tudo num ZIP. Cada chamada ao PNCP passa
// pelo mesmo cliente do Worker, que limita a concorrência e o ritmo de requisições.

export const FULL_EXPORT_LIMIT = 100;
export const FULL_EXPORT_FILE_BYTES = 512 * 1024 * 1024;
export const FULL_EXPORT_FORMAT = 'contratos-web/exportacao-completa';
const PAGE_SIZE = 100;
// Listagens vinculadas: o PNCP recusa páginas de 100 em contratos de uma contratação.
const RELATED_PAGE_SIZE = 50;
const MAX_PAGES = 1000;
// Falhas de transporte seguidas ao baixar arquivos indicam bloqueio do navegador (CORS);
// a partir daí os demais arquivos ficam só com os links, sem gastar requisições.
const BLOCK_AFTER_TRANSPORT_FAILURES = 2;
export const fullExportSections = {
  edital: ['arquivos', 'atas', 'contratos', 'historico'],
  ata: ['partesenvolvidas', 'contratos', 'arquivos', 'historico'],
  contrato: ['empenhos', 'instrumentocobranca', 'termos', 'arquivos', 'historico']
};
const childResources = ['termos', 'empenhos', 'instrumentocobranca'];
const encoder = new TextEncoder();

/** Nome de arquivo seguro em Windows, macOS e Linux, preservando a extensão. */
export function safeFileName(value, fallback = 'arquivo') {
  let name = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!name) name = fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name)) name = `_${name}`;
  if (name.length > 120) {
    const dot = name.lastIndexOf('.'),
      ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
    name = name.slice(0, 120 - ext.length).trimEnd() + ext;
  }
  return name;
}
function uniqueName(name, used) {
  let candidate = name,
    n = 2;
  const dot = name.lastIndexOf('.'),
    base = dot > 0 ? name.slice(0, dot) : name,
    ext = dot > 0 ? name.slice(dot) : '';
  while (used.has(candidate.toLowerCase())) candidate = `${base} (${n++})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
export function folderName(index, doc) {
  const key = (doc.numero_controle_pncp || doc.tipo_documento || 'documento')
    .replace(/[^0-9A-Za-z-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${String(index + 1).padStart(3, '0')}-${key || 'documento'}`;
}
function documentIdentity(doc) {
  return (
    doc._document || (doc.tipo_documento === 'edital' && doc._purchase ? { type: 'edital', ...doc._purchase } : null)
  );
}
function publicFields(doc) {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith('_')));
}
const omit = (record, keys) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
const withoutEnvelope = result => omit(result, ['api_version', 'request_id', 'upstream_requests', 'source']);
function errorEntry(section, error) {
  return {
    secao: section,
    codigo: error?.code || 'INTERNAL_ERROR',
    mensagem: error instanceof AppError ? error.message : 'Falha inesperada ao consultar o PNCP.'
  };
}
const escapeHtml = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const fileStatusLabels = {
  incluido: 'Incluído no ZIP',
  nao_baixado: 'Não baixado',
  sem_link: 'Sem link',
  limite_excedido: 'Limite de volume excedido'
};
function linksPage(documents, generatedAt) {
  const sections = documents
    .filter(doc => doc.arquivos.length)
    .map(doc => {
      const rows = doc.arquivos
        .map(
          file =>
            `<li>${file.url ? `<a href="${escapeHtml(file.url)}">${escapeHtml(file.titulo || 'Arquivo sem título')}</a>` : escapeHtml(file.titulo || 'Arquivo sem título')} — ${escapeHtml(file.tipo || 'tipo não informado')} — ${escapeHtml(fileStatusLabels[file.situacao] || file.situacao)}${file.arquivo ? ` (<code>${escapeHtml(file.arquivo)}</code>)` : ''}</li>`
        )
        .join('');
      return `<h2>${escapeHtml(doc.pasta)}</h2><p>${escapeHtml(doc.documento.titulo || '')}</p><ul>${rows}</ul>`;
    })
    .join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Arquivos da exportação</title><body><h1>Arquivos da exportação completa</h1><p>Gerado em ${escapeHtml(generatedAt)}. Links públicos do PNCP.</p>${sections || '<p>Nenhum arquivo nos documentos exportados.</p>'}</body></html>`;
}

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
    client = service.client,
    query = validateQuery({ ...input, page: 1, size: PAGE_SIZE }, config);
  // Cada download tem prazo próprio, maior que o das consultas, para arquivos grandes.
  const fileConfig = {
    ...config,
    PNCP_OPERATION_TIMEOUT_SECONDS:
      config.PNCP_READ_TIMEOUT_SECONDS * FILE_TIMEOUT_FACTOR * (config.PNCP_MAX_RETRIES + 1)
  };
  let serial = 0;
  const nextId = () => `${requestId}:${++serial}`;
  const op = operation(config, signal, requestId);
  let head, searchMetadata;
  try {
    await service.verifyDomains(query, op);
    head = await client.search(query, 1, PAGE_SIZE, op);
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
  const shared = { bytes: 0, included: 0, transportFailures: 0, blocked: false, done: 0 };
  const progress = phase =>
    onProgress({
      phase,
      documents: shared.done,
      total: documents.length,
      files: shared.included,
      bytes: shared.bytes
    });
  progress('documents');

  async function guard(entry, section, task) {
    try {
      return await task();
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error?.name === 'AbortError') throw error;
      entry.erros.push(errorEntry(section, error));
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
  async function download(entry, file) {
    if (!file.url) return (file.situacao = 'sem_link');
    if (shared.blocked) {
      file.situacao = 'nao_baixado';
      file.motivo = 'O navegador não conseguiu ler os arquivos anteriores do PNCP; use o link.';
      return;
    }
    if (shared.bytes >= FULL_EXPORT_FILE_BYTES || shared.included >= ZIP_MAX_ENTRIES - 2 * documents.length - 4)
      return (file.situacao = 'limite_excedido');
    const fileOp = operation(fileConfig, signal, nextId());
    try {
      const result = await client.file(file.url, fileOp);
      const size = result.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      shared.transportFailures = 0;
      if (shared.bytes + size > FULL_EXPORT_FILE_BYTES) return (file.situacao = 'limite_excedido');
      const name = uniqueName(safeFileName(result.filename || file.titulo), entry.usedNames);
      shared.bytes += size;
      shared.included++;
      Object.assign(file, {
        situacao: 'incluido',
        arquivo: `${entry.pasta}/${name}`,
        nome_original: result.filename,
        tipo_conteudo: result.content_type,
        tamanho_bytes: size
      });
      entry.blobs.push({ path: file.arquivo, chunks: result.chunks });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error?.name === 'AbortError') throw error;
      const transport = error?.code === 'PNCP_TRANSPORT_ERROR';
      if (transport && ++shared.transportFailures >= BLOCK_AFTER_TRANSPORT_FAILURES) shared.blocked = true;
      file.situacao = 'nao_baixado';
      file.motivo = transport
        ? 'O navegador não conseguiu ler o arquivo do PNCP (o download pode estar bloqueado por CORS); use o link.'
        : error?.code === 'PNCP_TIMEOUT' || error?.code === 'OPERATION_TIMEOUT'
          ? 'O download excedeu o tempo limite; use o link.'
          : error instanceof AppError
            ? error.message
            : 'Falha inesperada ao baixar o arquivo.';
    } finally {
      fileOp.finish();
    }
  }
  function fileRecord(origin, record) {
    return {
      origem: origin,
      titulo: record.titulo,
      tipo: record.tipo,
      data_publicacao: record.data_publicacao,
      url: record.url,
      situacao: 'pendente'
    };
  }

  async function collect(doc, index) {
    const type = doc.tipo_documento,
      identity = documentIdentity(doc);
    const entry = {
      indice: index + 1,
      pasta: folderName(index, doc),
      tipo_documento: type,
      identificacao: identity,
      documento: publicFields(doc),
      ...(doc._raw ? { registro_busca: doc._raw } : {}),
      detalhes: null,
      ...(type === 'edital' ? { itens: null } : {}),
      listagens: {},
      arquivos: [],
      erros: [],
      usedNames: new Set(),
      blobs: []
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
    for (const file of entry.arquivos) await download(entry, file);
    return entry;
  }

  // Dois documentos por vez mantêm a fila do cliente cheia; o limite real de
  // concorrência e de chamadas por segundo continua no cliente compartilhado.
  const entries = new Array(documents.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(documents.length, Math.max(1, config.PNCP_MAX_CONCURRENT_REQUESTS)) },
    async () => {
      while (cursor < documents.length) {
        const index = cursor++;
        entries[index] = await collect(documents[index], index);
        shared.done++;
        progress('documents');
      }
    }
  );
  await Promise.all(workers);
  signal.throwIfAborted();
  progress('zip');

  const finished = now(),
    generatedAt = finished.toISOString();
  const statuses = entries.flatMap(entry => entry.arquivos.map(file => file.situacao));
  const metadata = {
    ...searchMetadata,
    finished_at: generatedAt,
    export_scope: 'full',
    exported_rows: entries.length,
    files_total: statuses.length,
    files_included: statuses.filter(s => s === 'incluido').length,
    files_bytes: shared.bytes,
    files_blocked: shared.blocked,
    errors: entries.reduce((sum, entry) => sum + entry.erros.length, 0)
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
    resumo: {
      documentos: entries.length,
      arquivos: metadata.files_total,
      arquivos_incluidos: metadata.files_included,
      bytes_arquivos: metadata.files_bytes,
      erros: metadata.errors
    },
    observacoes: [
      'Os dados foram consultados no PNCP durante a exportação e podem diferir da tabela.',
      'Cada documento tem uma pasta com seus arquivos; a lista "arquivos" indica a situação e o caminho de cada um no ZIP.',
      ...(shared.blocked
        ? ['O navegador não conseguiu baixar arquivos do PNCP; os links públicos estão no JSON e em arquivos.html.']
        : [])
    ],
    documentos: entries.map(entry => omit(entry, ['usedNames', 'blobs']))
  };
  const zip = zipWriter({ now: finished });
  await zip.add('exportacao.json', encoder.encode(JSON.stringify(json, null, 2)), { compress: true });
  await zip.add('arquivos.html', encoder.encode(linksPage(json.documentos, generatedAt)), { compress: true });
  for (const entry of entries)
    for (const blob of entry.blobs) {
      signal.throwIfAborted();
      const data =
        blob.chunks.length === 1 ? blob.chunks[0] : new Uint8Array(await new Blob(blob.chunks).arrayBuffer());
      blob.chunks = null;
      await zip.add(blob.path, data);
    }
  return { chunks: zip.finish(), metadata };
}
