import { compareDecimal } from '../src/validation.js';
import { decimalKind, formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from './decimal-input.js';
import { createFilterLabelCache } from '../src/browser/filter-label-cache.js';
import { createRecentFilterOptions } from '../src/browser/recent-filter-options.js';
import { MUNICIPALITY_FIELDS } from './municipality-catalog.js';

// Modal de filtros: rascunho, editores de domínio, sugestões e amparos por normativo.
export function createFiltersPanel({
  document,
  window,
  service,
  state,
  session,
  $: getElementById,
  el,
  documentName,
  openDialog,
  refreshSelects,
  getCache,
  municipalities
}) {
  const $ = getElementById;
  const filterFields = new Map();
  // Sugestões são listas parciais; preserve os rótulos selecionados por tipo e campo.
  const selectedLabels = createFilterLabelCache(() => window.localStorage);
  const labelKey = (type, name, id) => JSON.stringify([type, name, id]);
  // Opções escolhidas recentemente nos campos com sugestão, mostradas antes de digitar.
  const recents = createRecentFilterOptions(() => window.localStorage);
  let municipalityCatalogFailed = false;
  function optionLabel(name, id, type = state.query.document_type) {
    const cap = state.schema.capabilities.find(cap => cap.name === name);
    return (
      (MUNICIPALITY_FIELDS.includes(name) ? municipalities?.get(id)?.label : undefined) ??
      selectedLabels.get(labelKey(type, name, id)) ??
      state.domains?.filters[cap?.domain]?.find(option => option.id === id)?.label ??
      id
    );
  }
  const pendingLabels = new Map();
  async function resolveLabels(query, rows = []) {
    const type = query.document_type;
    // Municípios usam o código IBGE: o rótulo vem da relação local, sem consultar o PNCP.
    if (municipalities && MUNICIPALITY_FIELDS.some(field => query.pncp_filters[field]?.length))
      await municipalities.load().catch(() => {});
    for (const [field, idField, nameField] of [
      ['orgaos', 'orgao_id', 'orgao_nome'],
      ['unidades', 'unidade_id', 'unidade_orgao_nome_unidade']
    ]) {
      for (const id of query.pncp_filters[field] || []) {
        if (state.query.document_type !== type) return;
        if (optionLabel(field, id, type) !== id) continue;
        const key = labelKey(type, field, id);
        if (!pendingLabels.has(key)) {
          const task = (async () => {
            let row = rows.find(row => row[idField] === id && row[nameField]);
            if (!row) {
              const result = await service.call('execute', {
                query: {
                  api_version: '2.0',
                  document_type: type,
                  q: '',
                  status: 'todos',
                  pncp_filters: { [field]: [id] },
                  order: '-data',
                  page: 1,
                  size: 10
                }
              });
              row = result.data.find(row => row[idField] === id && row[nameField]);
            }
            if (!row) return;
            selectedLabels.set(key, row[nameField]);
            const editor = filterFields.get(field);
            if (editor && currentEditor(editor) && editor.draft.document_type === type) {
              editor.selected = editor.selected.map(option =>
                option.id === id ? { ...option, label: row[nameField] } : option
              );
              syncFilterEditor(editor);
            }
          })()
            .catch(() => {
              /* Preserva o ID e permite tentar novamente ao atualizar. */
            })
            .finally(() => pendingLabels.delete(key));
          pendingLabels.set(key, task);
        }
        await pendingLabels.get(key);
      }
    }
  }
  let openFilterEditor = null;
  // Filtros mais usados aparecem primeiro, num grupo próprio; os demais seguem por assunto.
  const PRIMARY_FILTERS = [
    'data_publicacao_inicio',
    'data_publicacao_fim',
    'data_inicio_vigencia_inicio',
    'data_inicio_vigencia_fim',
    'ufs',
    'municipios',
    'orgaos',
    'modalidades',
    'situacoes',
    'valor_total_estimado_min',
    'valor_total_estimado_max',
    'valor_global_min',
    'valor_global_max',
    'fornecedores'
  ];
  const FILTER_GROUPS = ['Contratação', 'Item', 'Resultado do item', 'Fornecedor', 'Contrato'];

  function renderFilterStatuses() {
    const statuses = state.schema.statuses_by_document[state.query.document_type],
      statusNames = {
        todos: 'Todos',
        recebendo_proposta: 'Recebendo propostas',
        encerradas: 'Encerradas',
        propostas_encerradas: 'Em julgamento (propostas encerradas)',
        vigente: 'Vigentes',
        nao_vigente: 'Não vigentes'
      };
    {
      const select = $('status');
      select.replaceChildren();
      for (const value of statuses) {
        const option = el('option', statusNames[value] || value);
        option.value = value;
        select.append(option);
      }
    }
  }

  function stopFilterEditors() {
    closeFilterDropdown();
    state.domainAbort?.abort();
    session.next('domains');
    for (const editor of filterFields.values()) {
      editor.suggestAbort?.abort();
      clearTimeout(editor.suggestTimer);
      editor.suggestSeq++;
    }
  }
  function currentEditor(editor) {
    return editor.draft === state.draft && session.current('domains', editor.seq) && $('filters-dialog').open;
  }
  function syncFilterEditor(editor) {
    if (!editor) return;
    const value = state.draft.pncp_filters[editor.cap.name];
    editor.clear.hidden = value === undefined;
    if (editor.selected) {
      editor.selected = (value || []).map(
        id =>
          editor.options?.find(o => o.id === id) ||
          editor.selected.find(o => o.id === id) || {
            id,
            label: optionLabel(editor.cap.name, id, editor.draft.document_type)
          }
      );
      renderSelectedOptions(editor);
      updateFilterChoices(editor);
    } else if (editor.decimalKind) {
      // Durante a digitação o texto do usuário é preservado; fora dela, exibe o padrão brasileiro.
      if (!editor.editing) {
        editor.input.value = formatDecimalInput(editor.decimalKind, value);
        if (value === undefined) setDecimalError(editor, null);
      }
    } else editor.input.value = value === undefined ? '' : String(value);
    if (editor.cap.type === 'date') {
      if (editor.input.value) delete editor.input.dataset.empty;
      else editor.input.dataset.empty = 'true';
    }
    refreshSelects(editor.input);
    updateDraftActions();
  }
  function updateDraftActions() {
    if (!state.draft) return;
    const active = Object.keys(state.draft.pncp_filters).length,
      count = $('filter-active-count');
    if (count) {
      count.textContent = String(active);
      count.setAttribute(
        'aria-label',
        active ? `${active} ${active === 1 ? 'filtro ativo' : 'filtros ativos'}` : 'Nenhum filtro ativo'
      );
      count.hidden = active === 0;
    }
    $('clear-draft-filters').disabled = active === 0;
  }
  function clearDraftFilters() {
    if (!state.draft) return;
    state.legalAbort?.abort();
    session.next('legal');
    state.legalPending = false;
    state.legalError = false;
    if ($('legal-error')) $('legal-error').hidden = true;
    if ($('apply-filters')) $('apply-filters').disabled = false;
    state.draft.pncp_filters = {};
    for (const editor of filterFields.values()) syncFilterEditor(editor);
    updateDraftActions();
  }
  async function setDraftFilter(name, value) {
    const draft = state.draft,
      previous = JSON.stringify(draft.pncp_filters[name]);
    if (value === undefined) delete draft.pncp_filters[name];
    else draft.pncp_filters[name] = value;
    syncFilterEditor(filterFields.get(name));
    if (name === 'amparos_legais') {
      if (state.legalPending) return;
      state.legalAbort?.abort();
      session.next('legal');
      state.legalPending = false;
      state.legalError = false;
      $('apply-filters').disabled = false;
      $('legal-error').hidden = true;
      return;
    }
    if (
      name !== 'normativos_base' ||
      (previous === JSON.stringify(value) && !state.legalError && !filterFields.get('amparos_legais')?.input.disabled)
    )
      return;
    state.legalAbort?.abort();
    const seq = session.next('legal'),
      controller = new AbortController();
    state.legalAbort = controller;
    const editor = filterFields.get('amparos_legais');
    state.legalPending = true;
    state.legalError = false;
    $('apply-filters').disabled = true;
    $('legal-error').hidden = true;
    if (editor) {
      if (openFilterEditor === editor) closeFilterDropdown();
      editor.input.disabled = true;
      editor.loadSeq++;
    }
    try {
      const domains = await getDomains(controller.signal, 'amparos_legais');
      if (!session.current('legal', seq) || draft !== state.draft) return;
      const options = domains.filters.amparos_legais;
      if (!Array.isArray(options)) throw new Error('O PNCP não forneceu os amparos deste normativo.');
      const ids = new Set(options.map(o => o.id)),
        before = draft.pncp_filters.amparos_legais || [];
      const valid = before.filter(id => ids.has(id));
      if (valid.length) draft.pncp_filters.amparos_legais = valid;
      else delete draft.pncp_filters.amparos_legais;
      if (editor) populateFilterOptions(editor, domains);
      $('legal-error').hidden = valid.length === before.length;
      $('legal-error').textContent = 'Amparos incompatíveis foram removidos. Confira a seleção antes de pesquisar.';
    } catch (error) {
      if (session.current('legal', seq) && error.name !== 'AbortError') {
        state.legalError = !!draft.pncp_filters.amparos_legais?.length;
        $('legal-error').textContent =
          'Não foi possível conferir os amparos. Remova o filtro de amparo ou selecione novamente o normativo para tentar outra vez.';
        $('legal-error').hidden = false;
        if (editor) filterDomainError(editor, error);
      }
    } finally {
      if (session.current('legal', seq)) {
        state.legalPending = false;
        $('apply-filters').disabled = state.legalError;
      }
    }
  }
  async function openFilters(column = null) {
    stopFilterEditors();
    // Uma falha anterior ao carregar os municípios pode ser tentada de novo a cada abertura.
    if (!municipalities?.list) municipalityCatalogFailed = false;
    state.legalAbort?.abort();
    session.next('legal');
    state.legalPending = false;
    state.legalError = false;
    $('apply-filters').disabled = false;
    $('legal-error').hidden = true;
    state.draft = structuredClone(state.query);
    state.draft.q = $('search').value;
    filterFields.clear();
    $('filter-groups').replaceChildren();
    $('filter-popups').replaceChildren();
    const optionsRegion = el('p', '', 'sr-only');
    optionsRegion.id = 'filter-options-status';
    optionsRegion.setAttribute('role', 'status');
    $('filter-popups').append(optionsRegion);
    $('filters-title').textContent = `Filtros · ${documentName().label}`;
    openDialog('filters-dialog');
    if (!column) $('filter-search').focus({ preventScroll: true });
    const controller = new AbortController();
    state.domainAbort = controller;
    const base = getDomains(controller.signal);
    base.catch(() => {});
    const loads = [],
      target = column?.domain || column?.native_range?.[0];
    const available = state.schema.capabilities.filter(
      c => !c.reserved && c.state === 'enabled' && c.documents.includes(state.draft.document_type)
    );
    const primary = PRIMARY_FILTERS.map(name => available.find(c => c.name === name)).filter(Boolean);
    const groups = [
      ['Principais', primary],
      ...FILTER_GROUPS.map(groupName => [
        groupName,
        available.filter(c => c.group === groupName && !primary.includes(c))
      ])
    ];
    $('filter-search').value = '';
    $('filter-search-empty').hidden = true;
    for (const [groupName, caps] of groups) {
      if (!caps.length) continue;
      const group = el('details', undefined, 'filter-group'),
        legend = el(
          'summary',
          groupName === 'Contratação' && state.draft.document_type !== 'edital'
            ? 'Documento'
            : groupName === 'Contrato' && state.draft.document_type === 'ata'
              ? 'Ata'
              : groupName
        );
      // O grupo do campo alvo já nasce aberto (sem animação), para a rolagem usar a altura final.
      group.open = groupName === 'Principais' || caps.some(cap => cap.name === target);
      group.append(legend);
      const grid = el('div', undefined, 'filter-grid');
      group.append(grid);
      $('filter-groups').append(group);
      for (const cap of caps) {
        const editor = createFilterEditor(cap);
        editor.group = group;
        filterFields.set(cap.name, editor);
        grid.append(editor.area);
        if (cap.domain)
          loads.push(
            loadFilterOptions(
              editor,
              controller.signal,
              cap.domain_source === 'search' &&
                !(cap.name === 'amparos_legais' && state.draft.pncp_filters.normativos_base?.length)
                ? base
                : undefined
            ).then(() => {
              if (
                cap.name === target &&
                currentEditor(editor) &&
                !editor.input.disabled &&
                document.activeElement === editor.area
              )
                editor.input.focus({ preventScroll: true });
            })
          );
      }
    }
    $('filters-dialog').querySelector('.filters-body')?.scrollTo(0, 0);
    updateDraftActions();
    const editor = filterFields.get(target);
    if (editor && currentEditor(editor)) {
      editor.group.open = true;
      editor.area.scrollIntoView({ block: 'center' });
      if (editor.input.disabled) {
        editor.area.tabIndex = -1;
        editor.area.focus({ preventScroll: true });
      } else editor.input.focus({ preventScroll: true });
    }
    await Promise.all(loads);
  }
  async function getDomains(signal, field = null) {
    return getCache().get(
      {
        type: state.draft?.document_type || state.query.document_type,
        ...(field === 'amparos_legais' ? { normatives: state.draft?.pncp_filters.normativos_base } : {}),
        field
      },
      { signal }
    );
  }
  function createFilterEditor(definition) {
    // Alguns parâmetros têm rótulo próprio por tipo de documento (ex.: propostas em editais).
    const title = definition.labels_by_document?.[state.draft.document_type] || definition.label;
    const cap = title === definition.label ? definition : { ...definition, label: title };
    const area = el('div', undefined, 'filter-field');
    area.id = `filter-field-${cap.name}`;
    const label = el('label', cap.label || cap.name),
      input = el(cap.domain || cap.type === 'boolean' ? 'select' : 'input');
    const heading = el('div', undefined, 'filter-field-heading'),
      clear = el('button', undefined, 'text-button filter-reset');
    clear.type = 'button';
    clear.hidden = true;
    clear.setAttribute('aria-label', `Limpar ${cap.label}`);
    clear.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const help = el('p', cap.help_text || '', 'filter-help');
    help.id = `filter-help-${cap.name}`;
    help.hidden = !help.textContent;
    const error = el('p', undefined, 'inline-error');
    error.id = `filter-error-${cap.name}`;
    error.setAttribute('role', 'status');
    error.hidden = true;
    const editor = {
      cap,
      area,
      input,
      help,
      error,
      clear,
      draft: state.draft,
      seq: session.last('domains'),
      loadSeq: 0,
      suggestSeq: 0
    };
    if (cap.domain && cap.cardinality === 'multiple') {
      editor.input = el('input');
      editor.input.type = 'search';
      editor.municipal = Boolean(municipalities) && MUNICIPALITY_FIELDS.includes(cap.name);
      editor.input.placeholder = editor.municipal
        ? 'Buscar município'
        : cap.domain_kind === 'suggest'
          ? 'Digite ao menos 3 caracteres'
          : 'Buscar e selecionar opções';
      editor.input.autocomplete = 'off';
      editor.selected = [];
    } else if (cap.domain) {
      input.disabled = true;
    } else if (cap.type === 'boolean') {
      for (const [value, text] of [
        ['', 'Selecionar'],
        ['true', 'Sim'],
        ['false', 'Não']
      ]) {
        const option = el('option', text);
        option.value = value;
        input.append(option);
      }
    } else {
      input.type = cap.type === 'date' ? 'date' : cap.type === 'integer' ? 'number' : 'text';
      // Navegadores móveis não mostram o formato num campo de data vazio; o CSS exibe este texto.
      if (cap.type === 'date') input.dataset.placeholder = 'dd/mm/aaaa';
      if (cap.type === 'decimal') {
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        editor.decimalKind = decimalKind(cap.name);
        input.addEventListener('blur', () => {
          if (!editor.invalid && state.draft?.pncp_filters[cap.name] !== undefined)
            input.value = formatDecimalInput(editor.decimalKind, state.draft.pncp_filters[cap.name]);
        });
      }
      if (cap.input_hint) input.placeholder = cap.input_hint;
      if (cap.name === 'codigo_ibge') {
        input.inputMode = 'numeric';
        input.maxLength = 7;
      }
      if (cap.type === 'integer') {
        input.min = '0';
        input.step = '1';
      }
    }
    editor.input.id = `filter-${cap.name}`;
    if (!help.hidden) editor.input.setAttribute('aria-describedby', help.id);
    label.setAttribute('for', editor.input.id);
    heading.append(label, clear);
    area.append(heading, editor.input, help);
    clear.addEventListener('click', () => setDraftFilter(cap.name, undefined));
    if (editor.selected) {
      const selected = el('div', undefined, 'selected-options');
      selected.id = `filter-selected-${cap.name}`;
      editor.selectedArea = selected;
      const suggestions = el('div', undefined, 'suggestions filter-options-popup');
      suggestions.id = `filter-suggestions-${cap.name}`;
      suggestions.setAttribute('role', 'listbox');
      suggestions.setAttribute('aria-label', cap.label);
      suggestions.setAttribute('aria-multiselectable', 'true');
      suggestions.hidden = true;
      editor.suggestions = suggestions;
      editor.input.setAttribute('role', 'combobox');
      editor.input.setAttribute('aria-autocomplete', 'list');
      editor.input.setAttribute('aria-expanded', 'false');
      editor.input.setAttribute('aria-controls', suggestions.id);
      area.append(selected);
      $('filter-popups').append(suggestions);
      editor.input.addEventListener('focus', () => openFilterDropdown(editor));
      editor.input.addEventListener('click', () => openFilterDropdown(editor));
      editor.input.addEventListener('blur', () => {
        if (openFilterEditor === editor) closeFilterDropdown();
      });
      editor.input.addEventListener('keydown', event => filterDropdownKeydown(editor, event));
      editor.input.addEventListener('input', () => searchFilterOptions(editor));
      editor.input.disabled = true;
    } else {
      editor.input.addEventListener(cap.domain || cap.type === 'boolean' ? 'change' : 'input', () =>
        editFilter(editor)
      );
    }
    area.append(error);
    syncFilterEditor(editor);
    // Seleções vindas da URL ganham o nome do município assim que a relação carrega.
    if (editor.municipal && editor.selected.length) loadMunicipalities();
    return editor;
  }
  async function editFilter(editor) {
    if (!currentEditor(editor) || editor.input.disabled) return;
    const { cap, input } = editor;
    let value;
    if (editor.decimalKind) {
      const sanitized = sanitizeDecimalInput(editor.decimalKind, input.value);
      if (sanitized !== input.value) input.value = sanitized;
      const parsed = parseDecimalInput(editor.decimalKind, sanitized);
      setDecimalError(editor, parsed.error || null);
      editor.editing = true;
      try {
        await setDraftFilter(cap.name, parsed.value);
      } finally {
        editor.editing = false;
      }
      return;
    }
    if (cap.type === 'list') value = editor.selected.map(o => o.id);
    else value = input.value;
    if (value === '' || (Array.isArray(value) && !value.length)) value = undefined;
    else if (cap.type === 'boolean') value = value === 'true';
    else if (cap.type === 'integer') value = Number(value);
    await setDraftFilter(cap.name, value);
  }
  function populateFilterOptions(editor, domains) {
    const { cap, input } = editor;
    // Suggest-only domains may be absent from /filters; typing still queries /suggest.
    const options =
      domains.filters[cap.domain] === undefined && cap.domain_kind === 'suggest' ? [] : domains.filters[cap.domain];
    if (!Array.isArray(options) || (!options.length && cap.domain_kind !== 'suggest'))
      throw new Error('O PNCP não forneceu opções para este domínio.');
    mergeDomains(domains);
    editor.options =
      cap.name === 'anos'
        ? [...options].sort((a, b) => {
            const x = /^-?\d+(?:\.\d+)?$/.test(a.id),
              y = /^-?\d+(?:\.\d+)?$/.test(b.id);
            return x && y ? compareDecimal(a.id, b.id) : x ? -1 : y ? 1 : a.label.localeCompare(b.label, 'pt-BR');
          })
        : options;
    editor.error.hidden = true;
    const warning = domains.warnings?.find(w => w.domain === cap.domain);
    if (warning) {
      editor.error.textContent = warning.message;
      editor.error.hidden = false;
    }
    if (editor.selected) {
      editor.visibleOptions = null;
      if (openFilterEditor === editor) renderChoices(editor);
    } else {
      input.replaceChildren();
      const empty = el('option', 'Selecionar');
      empty.value = '';
      input.append(empty);
      for (const option of options) {
        const opt = el('option', option.label + (option.active === false ? ' (inativa)' : ''));
        opt.value = option.id;
        input.append(opt);
      }
    }
    input.disabled = false;
    input.setAttribute('aria-busy', 'false');
    syncFilterEditor(editor);
  }
  function filterDomainError(editor, error) {
    if (openFilterEditor === editor) closeFilterDropdown();
    editor.input.disabled = true;
    editor.input.setAttribute('aria-busy', 'false');
    editor.error.replaceChildren(el('span', error.message + ' '));
    editor.error.hidden = false;
    const retry = el('button', 'Tentar novamente', 'text-button');
    retry.type = 'button';
    retry.addEventListener('click', () =>
      editor.cap.name === 'amparos_legais'
        ? setDraftFilter('normativos_base', state.draft.pncp_filters.normativos_base)
        : loadFilterOptions(editor, state.domainAbort.signal)
    );
    editor.error.append(retry);
  }
  async function loadFilterOptions(editor, signal, source) {
    const token = ++editor.loadSeq;
    editor.input.disabled = true;
    editor.input.setAttribute('aria-busy', 'true');
    try {
      const domains = await (source || getDomains(signal, editor.cap.name));
      if (currentEditor(editor) && token === editor.loadSeq) populateFilterOptions(editor, domains);
    } catch (error) {
      if (error.name !== 'AbortError' && currentEditor(editor) && token === editor.loadSeq)
        filterDomainError(editor, error);
    }
  }
  const normalizedOptionText = value =>
    String(value)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR');
  function filterChoices(editor) {
    if (editor.cap.domain_kind === 'suggest') return editor.visibleOptions || (editor.options || []).slice(0, 20);
    const text = normalizedOptionText(editor.input.value.trim());
    return (editor.options || []).filter(option => normalizedOptionText(option.label + ' ' + option.id).includes(text));
  }
  function closeFilterDropdown() {
    if (!openFilterEditor) return;
    openFilterEditor.suggestions.hidden = true;
    openFilterEditor.input.setAttribute('aria-expanded', 'false');
    openFilterEditor.input.removeAttribute('aria-activedescendant');
    openFilterEditor = null;
  }
  function filterPopupBottom() {
    const footer = $('filters-dialog').querySelector('.dialog-footer');
    return Math.min(window.innerHeight - 16, footer ? footer.getBoundingClientRect().top - 4 : window.innerHeight - 16);
  }
  function positionFilterDropdown() {
    const editor = openFilterEditor;
    if (!editor || !editor.input.getBoundingClientRect) return;
    const anchor = editor.input.getBoundingClientRect(),
      body = $('filters-dialog').querySelector('.filters-body').getBoundingClientRect();
    if (anchor.top < body.top - 1 || anchor.bottom > body.bottom + 1) {
      closeFilterDropdown();
      return;
    }
    const popup = editor.suggestions,
      below = Math.max(0, filterPopupBottom() - anchor.bottom - 4),
      above = Math.max(0, anchor.top - body.top - 4);
    const up = below < 44 && above > below;
    popup.style.left = `${anchor.left}px`;
    popup.style.width = `${anchor.width}px`;
    popup.style.maxHeight = `${Math.min(224, up ? above : below)}px`;
    popup.style.top = `${up ? anchor.top - popup.getBoundingClientRect().height - 4 : anchor.bottom + 4}px`;
  }
  function openFilterDropdown(editor) {
    if (!currentEditor(editor) || editor.input.disabled) return;
    if (openFilterEditor === editor) {
      positionFilterDropdown();
      return;
    }
    if (openFilterEditor !== editor) closeFilterDropdown();
    editor.input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const body = $('filters-dialog').querySelector('.filters-body');
    if (body?.getBoundingClientRect && editor.input.getBoundingClientRect) {
      const desired = Math.min(224, Math.max(44, body.clientHeight / 2)),
        available = filterPopupBottom() - editor.input.getBoundingClientRect().bottom - 4;
      if (available < desired) body.scrollTop += desired - available;
    }
    openFilterEditor = editor;
    editor.suggestions.hidden = false;
    editor.input.setAttribute('aria-expanded', 'true');
    if (
      editor.municipal ||
      editor.cap.domain_kind !== 'suggest' ||
      editor.input.value.trim().length < 3 ||
      editor.visibleOptions
    )
      renderChoices(editor);
    positionFilterDropdown();
  }
  function updateFilterChoices(editor) {
    for (const { option, button, check } of editor.choices || []) {
      const selected = editor.selected.some(value => value.id === option.id);
      button.setAttribute('aria-selected', String(selected));
      check.textContent = selected ? '✓' : '';
    }
  }
  function activeFilterChoice(editor, index) {
    const choices = editor.choices || [];
    editor.activeIndex = index;
    for (const [i, { button }] of choices.entries()) button.dataset.active = String(i === index);
    const choice = choices[index];
    if (choice) {
      editor.input.setAttribute('aria-activedescendant', choice.button.id);
      choice.button.scrollIntoView({ block: 'nearest' });
    } else editor.input.removeAttribute('aria-activedescendant');
  }
  async function toggleFilterChoice(editor, option) {
    if (!currentEditor(editor) || editor.input.disabled) return;
    const key = labelKey(editor.draft.document_type, editor.cap.name, option.id);
    selectedLabels.set(key, option.label);
    const removing = editor.selected.some(value => value.id === option.id);
    if (!removing && editor.cap.domain_kind === 'suggest') recents.add(editor.cap.name, option);
    editor.selected = removing ? editor.selected.filter(value => value.id !== option.id) : [...editor.selected, option];
    await editFilter(editor);
    positionFilterDropdown();
  }
  function filterDropdownKeydown(editor, event) {
    if (event.key === 'Escape' && openFilterEditor === editor) {
      event.preventDefault();
      event.stopPropagation();
      closeFilterDropdown();
      return;
    }
    if (event.key === 'Tab') {
      if (openFilterEditor === editor) closeFilterDropdown();
      return;
    }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (openFilterEditor !== editor) openFilterDropdown(editor);
      const length = editor.choices?.length || 0;
      if (!length) return;
      activeFilterChoice(
        editor,
        event.key === 'ArrowDown'
          ? ((editor.activeIndex ?? -1) + 1) % length
          : ((editor.activeIndex ?? 0) - 1 + length) % length
      );
    } else if (event.key === 'Enter' && openFilterEditor === editor) {
      event.preventDefault();
      const choice = editor.choices?.[editor.activeIndex >= 0 ? editor.activeIndex : 0];
      if (choice) return toggleFilterChoice(editor, choice.option);
    }
  }
  function searchFilterOptions(editor) {
    if (!currentEditor(editor) || editor.input.disabled) return;
    clearTimeout(editor.suggestTimer);
    editor.suggestAbort?.abort();
    const token = ++editor.suggestSeq;
    editor.error.hidden = true;
    editor.visibleOptions = null;
    if (openFilterEditor !== editor) openFilterDropdown(editor);
    const q = editor.input.value.trim();
    if ((editor.municipal && !municipalityCatalogFailed) || editor.cap.domain_kind !== 'suggest' || q.length < 3) {
      renderChoices(editor);
      return;
    }
    editor.choices = [];
    editor.input.removeAttribute('aria-activedescendant');
    editor.suggestions.replaceChildren();
    appendListNote(editor, 'Consultando opções do PNCP…');
    editor.suggestTimer = setTimeout(async () => {
      const controller = new AbortController();
      editor.suggestAbort = controller;
      try {
        const result = await service.call(
          'suggest',
          { type: editor.draft.document_type, field: editor.cap.name, q, size: 20 },
          { signal: controller.signal }
        );
        if (currentEditor(editor) && token === editor.suggestSeq) showSuggestions(editor, [{ options: result.items }]);
      } catch (error) {
        if (error.name !== 'AbortError' && currentEditor(editor) && token === editor.suggestSeq) {
          editor.choices = [];
          editor.suggestions.replaceChildren();
          appendListNote(editor, 'Sugestões indisponíveis. Tente novamente.');
          editor.error.textContent = error.message;
          editor.error.hidden = false;
        }
      }
    }, 450);
  }
  // Relação local de municípios: carrega uma vez e atualiza o campo aberto e os nomes escolhidos.
  function loadMunicipalities() {
    if (!municipalities || municipalities.list) return;
    municipalities.load().then(
      () => {
        for (const editor of filterFields.values()) {
          if (!editor.municipal || !currentEditor(editor)) continue;
          editor.selected = editor.selected.map(option => ({
            ...option,
            label: optionLabel(editor.cap.name, option.id, editor.draft.document_type)
          }));
          renderSelectedOptions(editor);
          if (openFilterEditor === editor) renderChoices(editor);
        }
      },
      () => {
        // Sem a relação, os campos voltam às sugestões do PNCP (a partir de três caracteres).
        municipalityCatalogFailed = true;
        if (openFilterEditor?.municipal) searchFilterOptions(openFilterEditor);
      }
    );
  }
  function recentChoices(editor, text) {
    const term = normalizedOptionText(text);
    return recents
      .list(editor.cap.name)
      .map(option => ({ ...option, label: (editor.municipal && municipalities.get(option.id)?.label) || option.label }))
      .filter(option => !term || normalizedOptionText(option.label).includes(term));
  }
  const fmtCount = value => new Intl.NumberFormat('pt-BR').format(value);
  // Escolhe o que a lista do campo mostra: opções do domínio, municípios locais ou recentes.
  function renderChoices(editor) {
    const text = editor.input.value.trim();
    if (editor.municipal && !municipalityCatalogFailed) {
      const list = municipalities.list;
      if (!list) {
        showSuggestions(editor, [], 'Carregando municípios…');
        loadMunicipalities();
        return;
      }
      const ufs = editor.cap.name === 'municipios' ? editor.draft.pncp_filters.ufs || [] : [];
      const recent = text ? [] : recentChoices(editor, '');
      const known = new Set(recent.map(option => option.id));
      const { items, total } = municipalities.search(text, { ufs });
      const found = items.filter(item => !known.has(item.id)).map(({ id, label }) => ({ id, label }));
      const heading = text ? undefined : ufs.length ? `Municípios de ${ufs.join(', ')}` : 'Capitais';
      const note =
        total > items.length
          ? `Mostrando ${fmtCount(items.length)} de ${fmtCount(total)} municípios. Continue digitando para refinar.`
          : !text && !ufs.length
            ? `Digite para buscar entre os ${fmtCount(list.length)} municípios.`
            : '';
      showSuggestions(
        editor,
        [
          { heading: 'Usados recentemente', options: recent },
          { heading: recent.length ? heading : undefined, options: found }
        ],
        note
      );
      return;
    }
    if (editor.cap.domain_kind === 'suggest' && text.length < 3) {
      // Antes da busca no PNCP: recentes e as opções parciais que a lista inicial trouxer.
      const recent = recentChoices(editor, text),
        known = new Set(recent.map(option => option.id)),
        term = normalizedOptionText(text);
      const partial = (editor.options || [])
        .filter(option => !known.has(option.id) && (!term || normalizedOptionText(option.label).includes(term)))
        .slice(0, 20);
      showSuggestions(
        editor,
        [
          { heading: 'Usados recentemente', options: recent },
          { heading: recent.length && partial.length ? 'Outras opções' : undefined, options: partial }
        ],
        recent.length || partial.length
          ? 'Digite ao menos 3 caracteres para buscar outras opções no PNCP.'
          : 'Digite ao menos 3 caracteres para buscar no PNCP.'
      );
      return;
    }
    showSuggestions(editor, [{ options: filterChoices(editor) }]);
  }
  /**
   * @param {{ heading?: string, options: { id: string, label: string, active?: boolean }[] }[]} groups
   * @param {string} [note] Orientação exibida depois das opções.
   */
  function showSuggestions(editor, groups, note = '') {
    const list = editor.suggestions;
    list.replaceChildren();
    const options = groups.flatMap(group => group.options);
    editor.visibleOptions = options;
    editor.choices = [];
    editor.activeIndex = -1;
    editor.input.removeAttribute('aria-activedescendant');
    if (!options.length && !note) appendListNote(editor, 'Nenhuma opção encontrada.');
    else optionsStatus('');
    let index = 0;
    for (const group of groups) {
      if (!group.options.length) continue;
      // O título é visual; leitores de tela recebem as opções com o nome do campo.
      if (group.heading) {
        const heading = el('p', group.heading, 'panel-note suggestion-heading');
        heading.setAttribute('aria-hidden', 'true');
        list.append(heading);
      }
      for (const option of group.options) appendSuggestion(editor, option, index++);
    }
    if (note) appendListNote(editor, note, 'suggestion-hint');
    updateFilterChoices(editor);
    positionFilterDropdown();
  }
  // Uma listbox só pode conter opções acessíveis: as orientações ficam visíveis na lista, mas são
  // anunciadas pela região de status do painel, fora dela.
  function appendListNote(editor, text, className = '') {
    const note = el('p', text, `panel-note${className ? ' ' + className : ''}`);
    note.setAttribute('aria-hidden', 'true');
    editor.suggestions.append(note);
    optionsStatus(text);
  }
  function optionsStatus(text) {
    const region = $('filter-options-status');
    if (region && region.textContent !== text) region.textContent = text;
  }
  function appendSuggestion(editor, option, index) {
    const label = option.label + (option.active === false ? ' (inativa)' : ''),
      button = el('button', undefined, 'suggestion'),
      check = el('span', undefined, 'suggestion-check');
    check.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.tabIndex = -1;
    button.id = `filter-option-${editor.cap.name}-${index}`;
    button.dataset.value = option.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', label);
    button.append(check, el('span', label));
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => toggleFilterChoice(editor, option));
    editor.choices.push({ option, button, check });
    editor.suggestions.append(button);
  }
  function renderSelectedOptions(editor) {
    const area = editor.selectedArea;
    area.replaceChildren();
    for (const option of editor.selected) {
      const button = el('button', option.label + ' ×', 'selected-option');
      button.type = 'button';
      button.setAttribute('aria-label', `Remover ${option.label} de ${editor.cap.label}`);
      button.addEventListener('click', async () => {
        editor.selected = editor.selected.filter(o => o.id !== option.id);
        await editFilter(editor);
      });
      area.append(button);
    }
  }
  function searchFilterFields() {
    const terms = normalizedOptionText($('filter-search').value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    const groups = new Map();
    for (const editor of filterFields.values()) {
      const text = normalizedOptionText(editor.cap.label || editor.cap.name);
      editor.area.hidden = !terms.every(term => text.includes(term));
      if (!editor.area.hidden) visible++;
      groups.set(editor.group, (groups.get(editor.group) || 0) + (editor.area.hidden ? 0 : 1));
    }
    for (const [group, count] of groups) {
      group.hidden = count === 0;
      group.open = terms.length ? count > 0 : group.children[0].textContent === 'Principais';
    }
    $('filter-search-empty').hidden = visible > 0;
    if (openFilterEditor?.area.hidden) closeFilterDropdown();
  }
  function setDecimalError(editor, message) {
    editor.invalid = !!message;
    editor.error.textContent = message || '';
    editor.error.hidden = !message;
    if (message) {
      editor.input.setAttribute('aria-invalid', 'true');
      editor.input.setAttribute('aria-describedby', editor.error.id);
    } else {
      editor.input.removeAttribute('aria-invalid');
      if (editor.input.getAttribute('aria-describedby') === editor.error.id)
        editor.input.removeAttribute('aria-describedby');
    }
  }
  function apply() {
    if (state.legalPending || state.legalError) return null;
    // Valores decimais mal formados não são descartados em silêncio: bloqueiam a aplicação.
    const invalid = [...filterFields.values()].find(editor => editor.decimalKind && editor.invalid);
    if (invalid) {
      invalid.input.focus();
      return null;
    }
    state.draft.q = $('search').value;
    state.draft.status = $('status').value;
    return structuredClone(state.draft);
  }
  function mergeDomains(domains) {
    if (!domains?.filters) return;
    state.domains = { ...domains, filters: { ...state.domains?.filters, ...domains.filters } };
  }
  // Descarta rascunho, domínios e consultas pendentes deste painel (troca de consulta ou de tipo).
  function resetFilters() {
    stopFilterEditors();
    state.legalAbort?.abort();
    session.next('legal');
    state.legalPending = false;
    state.legalError = false;
    state.domains = null;
    state.draft = null;
  }
  function onDialogClose() {
    stopFilterEditors();
    state.legalAbort?.abort();
    session.next('legal');
  }
  $('filter-search').addEventListener('input', searchFilterFields);
  document.addEventListener('select-menu-open', closeFilterDropdown);
  document.addEventListener('pointerdown', event => {
    if (
      openFilterEditor &&
      event.target !== openFilterEditor.input &&
      !openFilterEditor.suggestions.contains(event.target)
    )
      closeFilterDropdown();
  });
  $('filters-dialog').querySelector('.filters-body')?.addEventListener('scroll', positionFilterDropdown);
  window.addEventListener('resize', closeFilterDropdown);
  return {
    open: openFilters,
    stop: stopFilterEditors,
    reset: resetFilters,
    mergeDomains,
    optionLabel,
    resolveLabels,
    closeDropdown: closeFilterDropdown,
    positionDropdown: positionFilterDropdown,
    renderStatuses: renderFilterStatuses,
    setDraftFilter,
    clearDraft: clearDraftFilters,
    apply,
    onDialogClose
  };
}
