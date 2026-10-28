import type {ColumnLayout, SearchQuery, SearchResult, DetailSelection} from './contracts.js';

// Casos negativos: o typecheck deve rejeitar contratos incompatíveis.
declare const query: SearchQuery;
// @ts-expect-error IDs de domínio são strings, nunca objetos arbitrários.
query.pncp_filters.ufs = [{id: 'SP'}];
// @ts-expect-error Apenas os três tipos documentais são aceitos.
query.document_type = 'outro';
declare const layout: ColumnLayout;
// @ts-expect-error Visibilidade é obrigatória e não pode ser nula.
layout.visible = null;
// @ts-expect-error Larguras são números, nunca strings.
layout.width.titulo = '180';
declare const result: SearchResult;
// @ts-expect-error Total precisa ser numérico.
result.total = '10';
// @ts-expect-error Uma ata precisa do sequencial da compra.
const selection: DetailSelection = {document: {type: 'ata', cnpj: '01234567000189', ano: '2026', sequencial: '1'}, tab: 'detalhes'};
void selection;
