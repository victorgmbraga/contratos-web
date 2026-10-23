import { scalarText, decimalText, safeLink } from './adapter.js';
import { isExactJsonNumber } from './exact-json.js';
import { assert } from './errors.js';

export const documentResources={edital:['arquivos','atas','contratos','historico'],ata:['partesenvolvidas','contratos','arquivos','historico'],contrato:['empenhos','instrumentocobranca','termos','arquivos','historico']};
export function nativeDocumentPath(document,base) {
  const {type,cnpj,ano,sequencial,sequencial_compra}=document;
  const positive=v=>/^\d+$/.test(v || '') && BigInt(v)>0n;
  assert(Object.hasOwn(documentResources,type) && /^\d{14}$/.test(cnpj || '') && /^\d{4}$/.test(ano || '') && positive(sequencial) && (type!=='ata' || positive(sequencial_compra)), 'INVALID_DOCUMENT_IDENTITY','Identificadores originais do documento inválidos.');
  return `${base}/orgaos/${cnpj}/${type==='contrato'?'contratos':'compras'}/${ano}/${type==='ata'?`${sequencial_compra}/atas/`:''}${sequencial}`;
}
export function controlLink(control) {
  const match=scalarText(control)?.match(/^(\d{14})-([12])-(\d+)\/(\d{4})(?:-(\d+))?$/);
  if(!match || BigInt(match[3])===0n || match[5] && (match[2]!=='1' || BigInt(match[5])===0n))return null;
  return `https://pncp.gov.br/app/${match[5]?'atas':match[2]==='2'?'contratos':'editais'}/${match[1]}/${match[4]}/${BigInt(match[3])}${match[5]?`/${BigInt(match[5])}`:''}`;
}
const field=(path,title,type='text',required=false)=>({path,title,type,required});
const indexedDefinitions=[
  ['numero_controle_pncp','Controle PNCP','control'],
  ['numero','Número'],['ano','Ano'],['numero_sequencial','Sequencial'],['numero_sequencial_compra_ata','Sequencial da compra da ata'],
  ['tipo_nome','Tipo'],['tipo_id','ID do tipo'],['situacao_nome','Situação'],['situacao_id','ID da situação'],['modalidade_licitacao_nome','Modalidade'],['modalidade_licitacao_id','ID da modalidade'],['tipo_contrato_nome','Tipo de contrato'],['tipo_contrato_id','ID do tipo de contrato'],['numero_contratacao','Número da contratação'],['numero_contrato_empenho','Número do contrato/empenho'],
  ['data_publicacao_pncp','Publicação no PNCP','date'],['data_atualizacao_pncp','Última atualização','date'],['data_assinatura','Assinatura','date'],['data_inicio_vigencia','Início da vigência','date'],['data_fim_vigencia','Fim da vigência','date'],['data_inicio_recebimento_propostas','Início do recebimento de propostas (campo PNCP)','datetime'],['data_fim_recebimento_propostas','Fim do recebimento de propostas (campo PNCP)','datetime'],['prazo_manifestacao_interesse','Prazo de manifestação de interesse','date'],
  ['valor_total_estimado','Valor total estimado','decimal'],['valor_total_homologado','Valor total homologado','decimal'],['valor_global','Valor global','decimal'],['srp','SRP','boolean'],['tem_resultado','Tem resultado','boolean'],['tem_ata_registro_preco','Tem ata de registro de preços','boolean'],['tem_contrato_empenho','Tem contrato/empenho','boolean'],['tem_nfe_contrato','Tem NF-e de contrato','boolean'],['possui_nfe','Possui NF-e','boolean'],['cancelado','Cancelado','boolean'],['permite_adesao','Permite adesão','boolean'],['indicador_orcamento_sigiloso','Orçamento sigiloso','boolean'],['exigencia_conteudo_nacional','Exigência de conteúdo nacional','boolean'],['possui_emenda_parlamentar','Possui emenda parlamentar','boolean'],['incentivo_produtivo_basico','Incentivo produtivo básico','boolean'],['aplicabilidade_margem_preferencia','Aplicabilidade da margem de preferência','boolean'],['aplicabilidade_margem_preferencia_normal','Margem de preferência normal','boolean'],['aplicabilidade_margem_preferencia_adicional','Margem de preferência adicional','boolean'],['tipo_item_irp','Tipo de item do IRP'],
  ['amparo_legal_nome','Amparo legal'],['amparo_legal_id','ID do amparo legal'],['normativo_base_nome','Normativo base'],['normativo_base_id','ID do normativo base'],['modo_disputa_nome','Modo de disputa'],['modo_disputa_id','ID do modo de disputa'],['criterio_julgamento_nome','Critério de julgamento'],['criterio_julgamento_id','ID do critério de julgamento'],['tipo_margem_preferencia_nome','Tipo de margem de preferência'],['tipo_margem_preferencia_id','ID do tipo de margem de preferência'],['tipo_margem_preferencia','Tipo de margem de preferência'],
  ['fonte_orcamentaria_nome','Fonte orçamentária'],['fonte_orcamentaria_id','ID da fonte orçamentária'],['usuario_nome','Fonte/Plataforma'],['usuario_id','ID da fonte/plataforma'],['link_processo_eletronico','Link do processo eletrônico','link'],
  ['orgao_nome','Órgão'],['orgao_cnpj','CNPJ do órgão'],['orgao_id','ID do órgão'],['unidade_nome','Unidade'],['unidade_codigo','Código da unidade'],['unidade_id','ID da unidade'],['uf','UF'],['municipio_nome','Município'],['municipio_id','ID do município'],['codigo_ibge','Código IBGE'],['esfera_nome','Esfera'],['esfera_id','ID da esfera'],['poder_nome','Poder'],['poder_id','ID do poder'],
  ['orgao_subrogado_nome','Órgão sub-rogado'],['orgao_subrogado_cnpj','CNPJ do órgão sub-rogado'],['orgao_subrogado_id','ID do órgão sub-rogado'],['unidade_subrogada_nome','Unidade sub-rogada'],['unidade_subrogada_codigo','Código da unidade sub-rogada'],['unidade_subrogada_id','ID da unidade sub-rogada'],['unidade_subrogada_municipio_nome','Município da unidade sub-rogada'],['unidade_subrogada_municipio_id','ID do município da unidade sub-rogada'],['unidade_subrogada_uf','UF da unidade sub-rogada'],
  ['fornecedor_nome','Fornecedor'],['fornecedor_ni','CPF/CNPJ do fornecedor'],['fornecedor_tipo_pessoa','Tipo de pessoa do fornecedor'],['fornecedor_id','ID do fornecedor'],['fornecedor_subcontratado_nome','Fornecedor subcontratado'],['fornecedor_subcontratado_ni','CPF/CNPJ do fornecedor subcontratado'],['fornecedor_subcontratado_tipo_pessoa','Tipo de pessoa do fornecedor subcontratado'],['fornecedor_subcontratado_id','ID do fornecedor subcontratado'],
  ['informacao_complementar','Informações complementares'],['chave_nfe','Chave da NF-e'],
  ['id','ID'],['createdAt','Criado em','datetime'],
].map(([path,title,type='text'])=>({path,title,type}));
const indexedLabels={
  data_inicio_vigencia:{edital:'Início do recebimento de propostas'},data_fim_vigencia:{edital:'Fim do recebimento de propostas'},
};
const indexedTypes={data_inicio_vigencia:{edital:'datetime'},data_fim_vigencia:{edital:'datetime'}};
function displayValue(value) {
  if(isExactJsonNumber(value))return value.toString();
  if(Array.isArray(value))return value.map(displayValue);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,displayValue(item)]));
  return value;
}
function indexedValue(value) {
  value=displayValue(value);
  if(value==null)return null;
  if(Array.isArray(value)){
    const items=value.filter(item=>item!=null && item!=='');
    if(!items.length)return null;
    return items.every(item=>typeof item!=='object')?items.map(item=>String(item)).join(', '):JSON.stringify(items);
  }
  if(typeof value==='object')return Object.keys(value).length?JSON.stringify(value):null;
  return typeof value==='string' && !value.trim()?null:value;
}
function indexedType(key,value) {
  if(typeof value==='boolean')return 'boolean';
  if(/^valor_|_(?:valor|preco|desconto)(?:_|$)/.test(key))return /^-?\d+(?:\.\d+)?$/.test(String(value))?'decimal':'text';
  if(key==='createdAt')return 'datetime';
  if(/^data_/.test(key))return 'date';
  if(/link|url/i.test(key))return 'link';
  return 'text';
}
function indexedLabel(path) {
  return path.replace(/([a-z0-9])([A-Z])/g,'$1 $2').split(/[_-]+/).filter(Boolean).map(part=>({
    id:'ID',url:'URL',pncp:'PNCP',nfe:'NF-e',cnpj:'CNPJ',cpf:'CPF',uf:'UF',srp:'SRP',ibge:'IBGE',irp:'IRP',
  })[part.toLocaleLowerCase('pt-BR')] || part.charAt(0).toLocaleUpperCase('pt-BR')+part.slice(1)).join(' ');
}
// A domain code or identifier is redundant when its name/description is available.
const descriptionPairs=[
  ['_codigo',['_descricao']],['_code',['_description']],['_id',['_nome','_descricao']],
  ['Codigo',['Descricao','Nome']],['Código',['Descrição','Nome']],['Code',['Description','Name']],
  ['Id',['Nome','Descricao']],['ID',['Nome','Descricao']],
  ['.codigo',['.descricao','.nome']],['.id',['.nome','.descricao']],
];
function descriptionCounterparts(path){
  for(const [suffix,candidates]of descriptionPairs){
    if(path.length<=suffix.length || !path.endsWith(suffix))continue;
    const prefix=path.slice(0,-suffix.length);
    return candidates.map(candidate=>prefix+candidate);
  }
  return [];
}
const omittedFields=new Set([
  'item_url','link_sistema_origem','itemUrl','linkSistemaOrigem','site_url','siteUrl',
  'document_type','documentType','description','index','doc_type','docType',
  'objeto_compra','objetoCompra','title',
  // Internal purchase identifiers are not shown by the PNCP detail page.
  'numeroCompra','anoCompra','sequencialCompra','numero','ano','numero_sequencial',
]);
const hasIndexedValue=value=>value!=null && value!=='' && (!Array.isArray(value) || value.length>0);
function indexedField(path,title,type,value) {
  if(type==='boolean')return {field:path,title,type,value:value===true};
  if(type==='decimal'){const text=decimalText(value);return text==null?null:{field:path,title,type,value:text};}
  if(type==='control'){const text=scalarText(value);return text==null?null:{field:path,title,type,value:text,url:controlLink(text)};}
  if(type==='link' || type==='pncp-link'){const text=scalarText(value),url=type==='pncp-link'?safeLink(text,true):safeLink(text);return text==null?null:{field:path,title,type:'link',value:text,...(url?{url}:{})};}
  if(type==='date' || type==='datetime'){const text=scalarText(value);return text==null?null:{field:path,title,type,value:text};}
  const text=indexedValue(value);return text==null?null:{field:path,title,type:'text',value:String(text)};
}
export function indexedDocumentFields(record) {
  assert(record && typeof record==='object' && !Array.isArray(record),'INVALID_UPSTREAM','Documento PNCP inválido.',502);
  const type=scalarText(record.document_type),fields=[],seen=new Set();
  const hasDescription=path=>descriptionCounterparts(path).some(pair=>hasIndexedValue(record[pair]));
  for(const definition of indexedDefinitions){
    seen.add(definition.path);
    if(definition.path==='id' || omittedFields.has(definition.path))continue;
    if(hasDescription(definition.path))continue;
    const value=indexedValue(record[definition.path]);
    if(value==null)continue;
    const fieldType=indexedTypes[definition.path]?.[type] || definition.type,resolvedType=fieldType==='datetime' && !/\d{1,2}:\d{2}/.test(String(value))?'date':fieldType;
    const field=indexedField(definition.path,indexedLabels[definition.path]?.[type] || definition.title,resolvedType,value);
    if(field)fields.push(field);
  }
  for(const [key,value] of Object.entries(record)){
    if(seen.has(key) || key.startsWith('_') || key==='id' || omittedFields.has(key))continue;
    if(hasDescription(key))continue;
    const normalized=indexedValue(value);
    if(normalized==null)continue;
    fields.push(indexedField(key,indexedLabel(key),indexedType(key,normalized),normalized));
  }
  return fields;
}
const organizationFields=[field('numeroControlePNCP','Controle PNCP','text',true),field('orgaoEntidade.razaoSocial','Órgão','text',true),field('orgaoEntidade.cnpj','CNPJ do órgão','text',true),field('unidadeOrgao.nomeUnidade','Unidade','text',true),field('unidadeOrgao.codigoUnidade','Código da unidade'),field('unidadeOrgao.ufSigla','UF','text',true),field('unidadeOrgao.municipioNome','Município','text',true),field('orgaoEntidade.esferaId','Esfera'),field('orgaoEntidade.poderId','Poder'),field('orgaoSubRogado.razaoSocial','Órgão sub-rogado'),field('orgaoSubRogado.cnpj','CNPJ do órgão sub-rogado'),field('unidadeSubRogada.nomeUnidade','Unidade sub-rogada'),field('unidadeSubRogada.codigoUnidade','Código da unidade sub-rogada'),field('unidadeSubRogada.municipioNome','Município da unidade sub-rogada'),field('unidadeSubRogada.ufSigla','UF da unidade sub-rogada')];
const dates=[field('dataAssinatura','Assinatura','date',true),field('dataVigenciaInicio','Início da vigência','date',true),field('dataVigenciaFim','Fim da vigência','date',true),field('dataPublicacaoPncp','Publicação','date',true),field('dataAtualizacao','Atualização','date',true),field('usuarioNome','Sistema publicador')];
const definitions={
  edital:[...organizationFields.filter(f=>['numeroControlePNCP','orgaoEntidade.razaoSocial','orgaoEntidade.cnpj','unidadeOrgao.nomeUnidade','unidadeOrgao.ufSigla','unidadeOrgao.municipioNome'].includes(f.path)),field('modalidadeNome','Modalidade','text',true),field('situacaoCompraNome','Situação','text',true),field('dataPublicacaoPncp','Publicação','date',true),field('dataAtualizacao','Atualização','date',true),field('valorTotalEstimado','Valor estimado','decimal',true),field('valorTotalHomologado','Valor homologado','decimal',true)],
  partesenvolvidas:[field('tipoParteEnvolvida.nome','Tipo','text',true),field('orgao.nome','Órgão','text',true),field('orgao.cnpj','CNPJ do órgão','text',true),field('unidade.nomeUnidade','Unidade','text',true),field('unidade.codigo','Código da unidade','text',true),field('unidade.localidade.nomeMunicipio','Município','text',true),field('unidade.localidade.uf','UF','text',true),field('dataInclusao','Inclusão','datetime',true)],
  ata:[...organizationFields,field('numeroAtaRegistroPreco','Número da ata','text',true),field('anoAta','Ano da ata'),field('modalidadeNome','Modalidade','text',true),...dates,field('cancelado','Cancelada','boolean',true),field('dataCancelamento','Cancelamento','date'),field('possibilidadeAdesao','Permite adesão','boolean',true),field('numeroControlePncpCompra','Contratação de origem','control'),field('informacaoComplementarCompra','Informações complementares')],
  contrato:[...organizationFields,field('numeroContratoEmpenho','Número do contrato/empenho','text',true),field('anoContrato','Ano do contrato'),field('tipoContrato.nome','Tipo de contrato','text',true),field('processo','Processo'),field('categoriaProcesso.nome','Categoria do processo'),field('receita','Receita','boolean'),...dates,
    field('nomeRazaoSocialFornecedor','Fornecedor','text',true),field('niFornecedor','CPF/CNPJ do fornecedor','text',true),field('tipoPessoa','Tipo de pessoa do fornecedor'),field('codigoPaisFornecedor','País do fornecedor'),field('nomeFornecedorSubContratado','Fornecedor subcontratado'),field('niFornecedorSubContratado','CPF/CNPJ do subcontratado'),field('tipoPessoaSubContratada','Tipo de pessoa do subcontratado'),
    field('valorInicial','Valor inicial','decimal',true),field('valorGlobal','Valor global','decimal',true),field('valorAcumulado','Valor acumulado','decimal'),field('valorParcela','Valor da parcela','decimal'),field('numeroParcelas','Número de parcelas'),field('frutoAdesao','Fruto de adesão','boolean'),field('temRemanejamento','Tem remanejamento','boolean'),field('emendaParlamentar','Emenda parlamentar','boolean'),field('numeroRetificacao','Número de retificações'),field('tipoParteEnvolvida.nome','Tipo de parte envolvida'),field('orgaoParteEnvolvida.razaoSocial','Órgão participante'),field('orgaoParteEnvolvida.cnpj','CNPJ do órgão participante'),field('unidadeOrgaoParteEnvolvida.nomeUnidade','Unidade participante'),
    field('numeroControlePncpCompra','Contratação de origem','control'),field('numeroControlePncpAta','Ata de origem','control'),field('identificadorCipi','Identificador CIPI'),field('urlCipi','Link CIPI','link'),field('informacaoComplementar','Informações complementares')],
  termos:[field('numeroTermoContrato','Número','text',true),field('tipoTermoContratoNome','Tipo','text',true),field('dataAssinatura','Assinatura','date',true),field('objetoTermoContrato','Objeto'),field('dataVigenciaInicio','Início da vigência','date'),field('dataVigenciaFim','Fim da vigência','date'),field('prazoAditadoDias','Prazo aditado (dias)'),field('valorAcrescido','Valor acrescido','decimal'),field('valorGlobal','Valor global','decimal'),field('valorParcela','Valor da parcela','decimal'),field('numeroParcelas','Número de parcelas'),field('informativoObservacao','Observações'),field('informacaoComplementar','Informações complementares'),field('dataAtualizacao','Atualização','date')],
  empenhos:[field('sequencialEmpenho','Sequencial'),field('numeroEmpenho','Número','text',true),field('valorTotal','Valor total','decimal',true),field('codigoEmenda','Emenda'),field('dataEmissaoEmpenho','Emissão','date',true),field('dataInclusao','Inclusão','datetime'),field('situacaoEmpenhoNome','Situação'),field('dataSituacaoEmpenho','Data da situação','datetime'),field('niCredorFornecedor','CPF/CNPJ do credor/fornecedor'),field('nomeRazaoSocialCredorFornecedor','Credor/fornecedor'),field('objetoEmpenho','Objeto'),field('observacao','Observações')],
  instrumentocobranca:[field('sequencialInstrumentoCobranca','Sequencial'),field('numeroInstrumentoCobranca','Número','text',true),field('tipoInstrumentoCobranca.nome','Tipo','text',true),field('dataInclusao','Inclusão','datetime'),field('dataEmissaoDocumento','Emissão','date'),field('valorTotal','Valor total','decimal'),field('chaveNFe','Chave da nota fiscal eletrônica'),field('observacao','Observações'),field('notaFiscalEletronica.numero','Número da NF-e'),field('notaFiscalEletronica.serie','Série da NF-e'),field('notaFiscalEletronica.valorTotal','Valor total da NF-e','decimal')],
};
function read(record,path) {
  let value=record;
  for(const part of path.split('.')){
    if(value==null)return null;
    assert(typeof value==='object' && !Array.isArray(value),'INVALID_UPSTREAM',`Campo ${path} inválido no PNCP.`,502);
    value=value[part];
  }
  return value;
}
const nativeLabels={
  tipoInstrumentoConvocatorioNome:'Tipo de instrumento convocatório',objetoCompra:'Objeto',
  orcamentoSigilosoDescricao:'Orçamento sigiloso',modoDisputaNome:'Modo de disputa',
  numeroControlePncpCompra:'Contratação de origem',numeroControlePncpAta:'Ata de origem',usuarioNome:'Sistema publicador',
  'orgaoEntidade.esferaId':'Esfera','orgaoEntidade.poderId':'Poder','unidadeOrgao.codigoUnidade':'Código da unidade',
  'orgaoSubRogado.razaoSocial':'Órgão sub-rogado','orgaoSubRogado.cnpj':'CNPJ do órgão sub-rogado','unidadeSubRogada.nomeUnidade':'Unidade sub-rogada','unidadeSubRogada.codigoUnidade':'Código da unidade sub-rogada','unidadeSubRogada.municipioNome':'Município da unidade sub-rogada','unidadeSubRogada.ufSigla':'UF da unidade sub-rogada',
};
function nativeExtraValue(value) {
  value=displayValue(value);
  if(value==null)return null;
  if(Array.isArray(value)){
    const items=value.filter(item=>item!=null && item!=='');
    if(!items.length)return null;
    return items.every(item=>typeof item!=='object')?items.map(item=>String(item)).join(', '):JSON.stringify(items);
  }
  if(typeof value==='object')return Object.keys(value).length?JSON.stringify(value):null;
  return typeof value==='string' && !value.trim()?null:value;
}
function nativeExtraField(path,value) {
  const label=nativeLabels[path] || indexedLabel(path.split('.').pop()),normalized=nativeExtraValue(value);
  if(normalized==null)return null;
  if(typeof normalized==='boolean')return {field:path,title:label,type:'boolean',value:normalized};
  if(/valor/i.test(path)){const text=String(normalized);return {field:path,title:label,type:/^-?\d+(?:\.\d+)?$/.test(text)?'decimal':'text',value:text};}
  if(/numeroControlePncp/i.test(path)){const text=scalarText(normalized);return text==null?null:{field:path,title:label,type:'control',value:text,url:controlLink(text)};}
  if(/link|url/i.test(path)){const text=scalarText(normalized),url=safeLink(text);return text==null?null:{field:path,title:label,type:'link',value:text,...(url?{url}:{})};}
  if(/^\d{4}-\d{2}-\d{2}T/.test(normalized) && /recebimento|inclusao|alteracao/i.test(path))return {field:path,title:label,type:'datetime',value:String(normalized)};
  if(/^\d{4}-\d{2}-\d{2}/.test(normalized) && /data|vigencia|assinatura|publicacao|atualizacao|cancelamento/i.test(path))return {field:path,title:label,type:'date',value:String(normalized)};
  return {field:path,title:label,type:'text',value:String(normalized)};
}
function nativeExtraFields(record,curated) {
  record=displayValue(record);
  const leaves=[];
  const walk=(value,path)=>{
    if(path && omittedFields.has(path))return;
    if(value==null || value==='' || Array.isArray(value) && !value.length)return;
    if(Array.isArray(value) || typeof value==='object'){
      if(Array.isArray(value)){leaves.push({path,value});return;}
      for(const [key,item] of Object.entries(value))walk(item,path?`${path}.${key}`:key);
      return;
    }
    leaves.push({path,value});
  };
  walk(record,'');
  // Curated fields are still considered as descriptions for their code pairs.
  const described=new Set(leaves.map(({path})=>path));
  return leaves
    .filter(({path})=>!curated.has(path) && !descriptionCounterparts(path).some(pair=>described.has(pair)))
    .map(({path,value})=>nativeExtraField(path,value))
    .filter(Boolean);
}
export function recordFields(kind,record) {
  assert(record && typeof record==='object' && !Array.isArray(record),'INVALID_UPSTREAM','Documento PNCP inválido.',502);
  const fields=definitions[kind].flatMap(({path,title,type,required})=>{
    let value=read(record,path);
    if(value==null && !required)return [];
    if(type==='boolean')assert(value==null || typeof value==='boolean','INVALID_UPSTREAM',`Campo ${path} não é booleano no PNCP.`,502);
    else if(type==='decimal')value=decimalText(value);
    else {
      assert(value==null || scalarText(value)!==null,'INVALID_UPSTREAM',`Campo ${path} inválido no PNCP.`,502);
      value=scalarText(value);
    }
    return [{field:path,title,type,value,...(type==='control'?{url:controlLink(value)}:type==='link'?{url:safeLink(value)}:{})}];
  });
  if(kind==='edital')fields.push(...nativeExtraFields(record,new Set(definitions.edital.map(definition=>definition.path))));
  return fields;
}
export function projectDocument(type,record) {
  const fields=recordFields(type,record);
  const object=type==='contrato'?record?.objetoContrato:record?.objetoCompra;
  assert(object==null || typeof object==='string','INVALID_UPSTREAM','Objeto do documento inválido no PNCP.',502);
  const clean=value=>scalarText(value)?.replace(/\s+/g,' ').trim() || null;
  const number=clean(type==='edital'?record.numeroCompra:type==='ata'?record.numeroAtaRegistroPreco:record.numeroContratoEmpenho),year=clean(type==='edital'?record.anoCompra:type==='ata'?record.anoAta:record.anoContrato);
  const kind=type==='edital'?clean(record.tipoInstrumentoConvocatorioNome) || 'Edital':type==='ata'?'Ata de Registro de Preços':/empenho/i.test(record.tipoContrato?.nome || '')?'Empenho':'Contrato';
  const titulo=number?`${kind} nº ${number}${year && !number.endsWith('/'+year)?'/'+year:''}`:clean(record.numeroControlePNCP);
  return {fields,objeto:scalarText(object),titulo,link_sistema_origem:safeLink(record.linkSistemaOrigem)};
}
