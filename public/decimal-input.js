import { money, quantity } from './format.js';

// Campos decimais dos filtros no padrão brasileiro: vírgula para decimais e ponto só como
// separador de milhar. O rascunho e a API usam o decimal canônico com ponto (ex.: "1000.50").

/** @param {string} name @returns {'money' | 'percent' | 'quantity'} */
export function decimalKind(name) {
  if (/percentual/.test(name)) return 'percent';
  if (/valor/.test(name)) return 'money';
  return 'quantity';
}

const messages = {
  money: 'Informe um valor em reais, por exemplo R$ 1.000,50.',
  percent: 'Informe um percentual com vírgula para decimais, por exemplo 5,25%.',
  quantity: 'Informe uma quantidade com vírgula para decimais, por exemplo 1.500,5.'
};

/**
 * Remove o que o tipo do campo não aceita enquanto o usuário digita.
 * Valores: dígitos, pontos, uma vírgula e o prefixo R$. Percentuais: dígitos, uma vírgula e % no fim.
 * Quantidades: dígitos, pontos e uma vírgula.
 * @param {'money' | 'percent' | 'quantity'} kind
 * @param {string} text
 */
export function sanitizeDecimalInput(kind, text) {
  const raw = String(text ?? '');
  const allowed = kind === 'percent' ? /[^\d,]/g : /[^\d.,]/g;
  let body = raw.replace(allowed, '');
  const comma = body.indexOf(',');
  if (comma >= 0) body = body.slice(0, comma + 1) + body.slice(comma + 1).replace(/[,.]/g, '');
  if (kind === 'money') return /^\s*R\$/.test(raw) && body ? `R$ ${body}` : body;
  if (kind === 'percent') return raw.includes('%') && body ? `${body}%` : body;
  return body;
}

/**
 * Converte o texto exibido no decimal canônico da API.
 * @param {'money' | 'percent' | 'quantity'} kind
 * @param {string} text
 * @returns {{ value: string | undefined, error?: string }}
 */
export function parseDecimalInput(kind, text) {
  let body = String(text ?? '').trim();
  if (kind === 'money') body = body.replace(/^R\$\s*/, '');
  if (kind === 'percent') body = body.replace(/\s*%$/, '');
  if (!body) return { value: undefined };
  // Ponto só é aceito como separador de milhar em grupos de três dígitos.
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(body);
  if (!match) return { value: undefined, error: messages[kind] };
  const integer = match[1].replace(/\./g, '');
  return { value: match[2] ? `${integer}.${match[2]}` : integer };
}

/**
 * Exibe o decimal canônico da API no padrão brasileiro do campo.
 * @param {'money' | 'percent' | 'quantity'} kind
 * @param {string | number | null | undefined} value
 */
export function formatDecimalInput(kind, value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  if (kind === 'money') return money(text);
  if (kind === 'percent') return `${quantity(text)}%`;
  return quantity(text);
}
