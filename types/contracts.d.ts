export type DocumentType = 'edital' | 'ata' | 'contrato';
export type PageSize = 10 | 25 | 50 | 100;
export type FilterValue = string | string[] | boolean | number;
export interface SearchQuery {
  api_version: '2.0'; document_type: DocumentType; q: string; status: string;
  pncp_filters: Record<string, FilterValue>; order: string; page: number; size: PageSize;
}
export type DocumentIdentity =
  | {type: 'edital' | 'contrato'; cnpj: string; ano: string; sequencial: string}
  | {type: 'ata'; cnpj: string; ano: string; sequencial: string; sequencial_compra: string};
export interface DetailSelection { document: DocumentIdentity; tab: string }
export interface ProjectedDocument {
  [field: string]: unknown;
  tipo_documento: DocumentType; titulo: string | null; numero_controle_pncp: string | null;
  objeto_compra: string | null; orgao_nome: string | null; municipio_nome: string | null; uf: string | null;
  _identity: string | null; _document: DocumentIdentity | null; _raw?: Record<string, unknown>;
}
export interface SearchResult {
  api_version: '2.0'; document_type: DocumentType; source: 'pncp'; request_id: string;
  data: ProjectedDocument[]; page: number; size: PageSize; last_page: number; last_row: number;
  source_total: number; accessible_total: number; total: number; window_limited: boolean;
  collection_complete: boolean; snapshot_guaranteed: false; started_at: string; finished_at: string;
  elapsed_ms: number; upstream_requests: number; effective_filters: Record<string, FilterValue>;
  warnings: {code: string; message: string}[];
}
export type ExportMetadata = Omit<SearchResult, 'data'> & {exported_rows: number; export_scope: 'all' | 'page'};
export interface ExportResult {chunks: ArrayBuffer[]; mime: string; filename: string; metadata: ExportMetadata}
export interface ResultCacheEntry {at: number; result: SearchResult}
export interface ColumnLayout {order: string[]; visible: Record<string, boolean>; width: Record<string, number>}
export interface ColumnPreference {field: string; visible: boolean; width: number}
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface OptionsDatabase {
  get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>; close(): void;
}
