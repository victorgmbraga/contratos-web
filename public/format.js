// Formatação compartilhada dos valores projetados do PNCP.
// Situação da Contratação: PNCP, Manual de Integração, tabela de domínio 7.13.
const purchaseStatusClasses=new Map([
  ['divulgada no pncp','status-cell--divulgada'],
  ['revogada','status-cell--revogada'],
  ['anulada','status-cell--anulada'],
  ['suspensa','status-cell--suspensa'],
]);
const integerFormatter=new Intl.NumberFormat('pt-BR'),timeFormatter=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'});
const fmtInt = value => integerFormatter.format(value);
const time = value => {if(!value)return '—';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?String(value):timeFormatter.format(parsed);};
const date = value => value ? (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10).split('-').reverse().join('/') : value) : '—';
function quantity(value) {
  if(value===null || value===undefined)return '—';
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if(!match)return String(value);
  const fraction=(match[3] || '').replace(/0+$/,'');
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')}${fraction?','+fraction:''}`;
}
function money(value) {
  if(value===null || value===undefined)return '—';
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if(!match)return String(value);
  return `${match[1]}R$ ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${(match[3] || '').padEnd(2,'0')}`;
}
// Cells render source text as text and nodes; the table only appends them.
export function createCellRenderer(el) {
  return function renderCell(value,column) {
    const node=el('span',value===null || value===undefined?'—':column.type==='date'?date(value):column.type==='decimal'?money(value):column.type==='boolean'?(value?'Sim':'Não'):column.mask==='cnpj'?formatCnpj(value):column.mask==='cpf-cnpj'?formatCpfCnpj(value):String(value));
    if(column.field==='objeto_compra'){node.className='object-text';node.title=value ?? '';}
    if(column.type==='decimal')node.className='money-cell';
    if(column.field==='situacao_compra_nome_pncp') {
      const label=String(value ?? '').normalize('NFC').trim().replace(/\s+/g,' ');
      node.className=`status-cell ${purchaseStatusClasses.get(label.toLocaleLowerCase('pt-BR')) || 'status-cell--unknown'}`;
      if(!label)node.textContent='—';
      node.title=label || 'Situação não informada';
    }
    return node;
  };
}
const cnpjDigits = value => String(value ?? '').replace(/\D/g, '');
export function formatCnpj(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  // "CNPJ - nome" mantém o nome e mascara somente o identificador.
  const joined = text.match(/^(.*?)(\s+-\s+[\s\S]*)$/);
  if (joined) return formatCnpj(joined[1]) + joined[2];
  const digits = cnpjDigits(text);
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : text;
}
export function formatCpf(value) {
  if (value === null || value === undefined) return value;
  const digits = cnpjDigits(value);
  return digits.length === 11 ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(value);
}
export function formatCpfCnpj(value) {
  if (value === null || value === undefined) return value;
  const digits = cnpjDigits(value);
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) return formatCpf(digits);
  return String(value);
}
export { fmtInt, time, date, quantity, money };
