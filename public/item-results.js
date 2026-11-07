import { date, quantity, formatCnpj } from './format.js';

// Resultado homologado dos itens de edital, exibido à parte do valor estimado: são conceitos
// distintos (estimativa do órgão e valor adjudicado ao fornecedor) e nunca entram na mesma conta.

/** Preço em reais com ao menos duas casas, sem descartar as demais casas informadas pelo PNCP. */
export function price(value) {
  if (value === null || value === undefined) return '—';
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return String(value);
  const fraction = (match[3] || '').replace(/0+$/, '').padEnd(2, '0');
  return `${match[1]}R$ ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
}

// Escala inteira comum para dividir sem ponto flutuante nos valores (só o percentual é arredondado).
function scaled(value) {
  const match =
    typeof value === 'string' || typeof value === 'number' ? String(value).match(/^(\d+)(?:\.(\d+))?$/) : null;
  return match ? { digits: BigInt(match[1] + (match[2] || '')), scale: (match[2] || '').length } : null;
}
/**
 * Diferença percentual do valor unitário homologado para o estimado, com uma casa decimal.
 * @returns {number | null} Negativa quando o homologado ficou abaixo do estimado.
 */
export function priceDifference(homologated, estimated) {
  const a = scaled(homologated),
    b = scaled(estimated);
  if (!a || !b || b.digits === 0n) return null;
  const scale = Math.max(a.scale, b.scale),
    x = a.digits * 10n ** BigInt(scale - a.scale),
    y = b.digits * 10n ** BigInt(scale - b.scale);
  // Décimos de ponto percentual, arredondados para o mais próximo.
  const tenths = ((x - y) * 2000n + (x >= y ? y : -y)) / (2n * y);
  return Number(tenths) / 10;
}
export function differenceText(difference) {
  if (difference === null) return null;
  if (difference === 0) return 'Igual ao estimado';
  const value = Math.abs(difference).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return difference < 0 ? `${value}% abaixo do estimado` : `${value}% acima do estimado`;
}

/** Fornecedor como exibido: CNPJ só de pessoa jurídica; o CPF de pessoa física não é mostrado. */
export function supplierText(result) {
  const name = result.fornecedor ?? 'Fornecedor não informado';
  if (result.tipo_pessoa === 'PJ' && /^\d{14}$/.test(result.fornecedor_ni ?? '')) {
    return `${name} · CNPJ ${formatCnpj(result.fornecedor_ni)}`;
  }
  if (result.tipo_pessoa === 'PF') return `${name} · Pessoa física`;
  return name;
}

/**
 * Lista dos resultados de um item.
 * @param {(tag: string, text?: string, className?: string) => HTMLElement} el
 * @param {any[]} results Resultados projetados pelo Worker.
 * @param {unknown} estimated Valor unitário estimado do item (texto decimal), quando divulgado.
 */
export function renderItemResults(el, results, estimated) {
  const list = el('ol', undefined, 'item-results-list');
  for (const result of results) {
    const entry = el('li', undefined, 'item-result');
    const cancelled = result.data_cancelamento !== null;
    entry.append(el('p', supplierText(result), 'item-result-supplier'));
    const notes = [
      result.situacao,
      result.porte && `Porte ${result.porte}`,
      results.length > 1 &&
        /^[1-9]\d*$/.test(result.ordem_classificacao_srp ?? '') &&
        `${result.ordem_classificacao_srp}º classificado`
    ].filter(Boolean);
    if (cancelled)
      notes.push(
        `Cancelado em ${date(result.data_cancelamento)}${result.motivo_cancelamento ? `: ${result.motivo_cancelamento}` : ''}`
      );
    if (notes.length) entry.append(el('p', notes.join(' · '), 'item-meta'));
    const difference = differenceText(priceDifference(result.valor_unitario_homologado, estimated));
    const values = el('dl', undefined, 'item-values item-result-values');
    for (const [label, value] of [
      ['Valor unitário homologado', price(result.valor_unitario_homologado)],
      ['Quantidade homologada', quantity(result.quantidade_homologada)],
      ['Valor total homologado', price(result.valor_total_homologado)],
      ['Data do resultado', result.data_resultado ? date(result.data_resultado) : '—'],
      ['Comparação com o estimado', difference ?? '—'],
      ...(result.moeda_estrangeira
        ? [[`Valor em ${result.moeda_estrangeira}`, quantity(result.valor_nominal_moeda_estrangeira)]]
        : [])
    ]) {
      const field = el('div');
      field.append(el('dt', label), el('dd', value));
      values.append(field);
    }
    entry.append(values);
    list.append(entry);
  }
  return list;
}
