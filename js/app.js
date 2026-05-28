import {
  aplicarFiltros,
  opcoesUnicas,
  totaisKPI,
  STATUS_LIST,
  CRITICIDADE_LIST,
  NATUREZA_LIST,
  NATUREZA_LABELS,
  calcularStatus,
  enriquecerRegistro,
  proximoItemId,
  registrosDoMesmoItem,
  normalizarNatureza,
  agregarFornecedores,
} from './logic.js';
import { initCalendario, updateCalendario } from './calendario.js?v=2';
import { carregarRegistros, salvarRegistro, excluirRegistro, duplicarRegistro, signIn, signUp, signOut, onAuthStateChange, getClient, subscribeToRealtime } from './db.js';
import { renderDashboardCharts, renderCrudMesChart, destroyCrudMesChart } from './charts.js?v=4';
import {
  COLUNAS_TABELA,
  valorCelula,
  exportarExcel,
  toast,
  confirmar,
  fmtMoeda,
} from './ui.js?v=3';
import { abrirDrilldown, fecharDrilldown, setDrilldownEditHandler, setDrilldownPhotoHandler } from './drilldown.js?v=5';
import { initExcelImport } from './import_excel.js?v=8';

let registros = [];
let filtros = {
  natureza: 'TODOS',
  status: 'TODOS',
  criticidade: 'TODOS',
  linha: 'TODOS',
  maquina: 'TODOS',
  fornecedor: 'TODOS',
  busca: '',
};
let viewAtual = 'dashboard';
let editando = null;
let linhaSelecionadaId = null;
let fotoUrlAtual = null;
let isInlineEditMode = false;
let isAppInitialized = false;

const $ = (sel) => document.querySelector(sel);

function getFiltrados() {
  let base = registros;
  if (viewAtual === 'consertos') base = base.filter((r) => r.natureza === 'CONSERTO');
  if (viewAtual === 'compras') base = base.filter((r) => r.natureza === 'COMPRA');
  return aplicarFiltros(base, filtros);
}

function registrosAtrasados(data) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return data.filter((r) => {
    const st = r.status || calcularStatus(r);
    if (st === 'ENTREGUE') return false;
    if (!r.previsao_entrega) return false;
    return new Date(r.previsao_entrega) < hoje;
  });
}

function renderKPIs() {
  const data = getFiltrados();
  const k = totaisKPI(data);
  const atrasados = registrosAtrasados(data);

  $('#kpiTotal').textContent = k.total;
  $('#kpiValor').textContent = k.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiPrevisto').textContent = k.totalPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiRecebido').textContent = k.totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiAtrasados').textContent = atrasados.length;

  const chips = Object.entries(k.porStatus)
    .map(([s, n]) => `<button type="button" class="status-chip" data-status="${s}">${s} <em>${n}</em></button>`)
    .join('');
  $('#kpiStatusChips').innerHTML = chips || '<span class="muted">—</span>';

  $('#kpiStatusChips').querySelectorAll('.status-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtros.status = btn.dataset.status;
      $('#filtroStatus').value = btn.dataset.status;
      if (viewAtual === 'dashboard') showView('rc');
      else refresh();
    });
  });

  const cardAtrasados = $('#kpiCardAtrasados');
  cardAtrasados?.classList.toggle('kpi-alert', atrasados.length > 0);
  cardAtrasados?.classList.toggle('kpi-clickable-active', atrasados.length > 0);
  cardAtrasados?.setAttribute('aria-disabled', atrasados.length ? 'false' : 'true');
}

function abrirPainelAtrasados() {
  const atrasados = registrosAtrasados(getFiltrados());
  const total = atrasados.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  abrirDrilldown({
    titulo: 'Itens atrasados',
    subtitulo: `${atrasados.length} registro(s) · previsão de entrega vencida`,
    registros: atrasados,
    meta: {
      insight: atrasados.length
        ? `Valor total em atraso: ${fmtMoeda(total)}. Itens ainda não entregues com data prevista anterior a hoje.`
        : 'Nenhum item atrasado com os filtros atuais.',
    },
  });
}

function renderFiltros() {
  const setSelect = (id, campo, extra = ['TODOS']) => {
    const el = $(id);
    if (!el) return;
    const cur = el.value;
    const opts = [...extra, ...opcoesUnicas(registros, campo)];
    el.innerHTML = opts.map((o) => `<option value="${o}">${o}</option>`).join('');
    if (opts.includes(cur)) el.value = cur;
  };
  setSelect('#filtroNatureza', 'natureza', ['TODOS']);
  setSelect('#filtroLinha', 'linha');
  setSelect('#filtroMaquina', 'maquina');
  setSelect('#filtroFornecedor', 'fornecedor');
}

function atualizarBarraLinha() {
  const bar = $('#rowActionBar');
  const label = $('#rowActionLabel');
  if (!bar) return;

  if (!linhaSelecionadaId) {
    bar.classList.add('hidden');
    return;
  }

  const r = registros.find((x) => x.id === linhaSelecionadaId);
  if (!r) {
    linhaSelecionadaId = null;
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  if (label) {
    label.textContent = `ID ${r.item_id ?? '—'} · ${r.item || '—'} · ${r.status || calcularStatus(r)}`;
  }
}

function selecionarLinha(id) {
  linhaSelecionadaId = id;
  document.querySelectorAll('#tabelaBody tr').forEach((tr) => {
    tr.classList.toggle('row-selected', tr.dataset.id === id);
  });
  atualizarBarraLinha();
}

const COLUNAS_EDITAVEIS = ['fornecedor', 'data_saida', 'orcamento', 'rc', 'po', 'data_recebimento', 'nf'];

function renderTabela() {
  const data = getFiltrados();
  const thead = $('#tabelaHead');
  const tbody = $('#tabelaBody');
  const count = $('#tableCount');

  if (linhaSelecionadaId && !data.some((r) => r.id === linhaSelecionadaId)) {
    linhaSelecionadaId = null;
  }

  thead.innerHTML =
    '<tr>' + COLUNAS_TABELA.map((c) => `<th style="min-width:${c.width}px">${c.label}</th>`).join('') + '</tr>';

  count.textContent = `${data.length} registro(s)`;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${COLUNAS_TABELA.length}" class="empty">Nenhum registro encontrado</td></tr>`;
    linhaSelecionadaId = null;
    atualizarBarraLinha();
    return;
  }

  tbody.innerHTML = data
    .map((r) => {
      const atrasado =
        (r.status || calcularStatus(r)) !== 'ENTREGUE' &&
        r.previsao_entrega &&
        new Date(r.previsao_entrega) < new Date();
      const sel = r.id === linhaSelecionadaId ? ' row-selected' : '';
      return `
    <tr data-id="${r.id}" class="${atrasado ? 'row-late' : ''}${sel}">
      ${COLUNAS_TABELA.map((c) => {
        const rawVal = r[c.key] ?? '';
        let cellHtml = valorCelula(r, c);
        if (isInlineEditMode && COLUNAS_EDITAVEIS.includes(c.key)) {
          cellHtml = `<div class="inline-edit-cell" data-col="${c.key}" data-raw="${String(rawVal).replace(/"/g, '&quot;')}" title="Clique para editar">${cellHtml}</div>`;
        }
        return `<td title="${rawVal}">${cellHtml}</td>`;
      }).join('')}
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => selecionarLinha(tr.dataset.id));
    tr.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (!isInlineEditMode) abrirDetalhe(tr.dataset.id);
    });
  });

  if (isInlineEditMode) {
    tbody.querySelectorAll('.inline-edit-cell').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cell.querySelector('input')) return;
        const col = cell.dataset.col;
        const rawVal = cell.dataset.raw;
        const id = cell.closest('tr').dataset.id;
        const registro = data.find((x) => x.id === id);
        if (!registro) return;

        const input = document.createElement('input');
        input.type = col.startsWith('data_') ? 'date' : 'text';
        input.value = rawVal;
        input.className = 'inline-edit-input';

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '4px';
        wrapper.appendChild(input);

        const btnSave = document.createElement('button');
        btnSave.innerHTML = '&#10003;';
        btnSave.title = 'Salvar';
        btnSave.style.cssText = 'background:var(--success);border:none;color:#fff;border-radius:3px;cursor:pointer;padding:2px 6px;font-size:12px;';
        
        const btnCancel = document.createElement('button');
        btnCancel.innerHTML = '&#10005;';
        btnCancel.title = 'Cancelar';
        btnCancel.style.cssText = 'background:var(--danger);border:none;color:#fff;border-radius:3px;cursor:pointer;padding:2px 6px;font-size:12px;';

        wrapper.appendChild(btnSave);
        wrapper.appendChild(btnCancel);

        cell.innerHTML = '';
        cell.appendChild(wrapper);
        input.focus();

        const cancelInline = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          refresh();
        };

        const salvarInline = async (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          const newVal = input.value.trim();
          if (newVal === rawVal) {
            refresh();
            return;
          }
          const updated = enriquecerRegistro({ ...registro, [col]: newVal || null });
          const index = registros.findIndex((x) => x.id === id);
          if (index !== -1) {
            registros[index] = updated;
          }
          try {
            await salvarRegistro(updated);
            registros = await carregarRegistros();
            toast('Registro atualizado.', 'success');
          } catch (err) {
            toast('Erro ao salvar: ' + err.message, 'error');
          }
          refresh();
        };

        btnSave.addEventListener('click', salvarInline);
        btnCancel.addEventListener('click', cancelInline);

        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            salvarInline();
          }
          if (evt.key === 'Escape') {
            cancelInline();
          }
        });
      });
    });
  }

  atualizarBarraLinha();
}

function abrirDetalhe(id) {
  const r = registros.find((x) => x.id === id);
  if (!r) return;
  abrirDrilldown({
    titulo: r.item,
    subtitulo: `${r.maquina_linha || ''} · ${r.status || calcularStatus(r)}`,
    registros: [r],
    meta: { insight: r.descricao_falha || 'Sem descrição de falha cadastrada.' },
  });
}

function refresh() {
  renderKPIs();
  renderTabela();
  if (viewAtual === 'dashboard') {
    requestAnimationFrame(() => renderDashboardCharts(getFiltrados()));
  } else if (viewAtual === 'consertos' || viewAtual === 'compras') {
    const chartSection = $('#crudMesChartSection');
    const chartTitle = $('#crudMesChartTitle');
    chartSection?.classList.remove('hidden');
    if (chartTitle) {
      chartTitle.textContent =
        viewAtual === 'consertos' ? 'Consertos: Previsto x Recebido' : 'Compras: Previsto x Recebido';
    }
    requestAnimationFrame(() =>
      renderCrudMesChart(
        getFiltrados(),
        viewAtual === 'consertos' ? 'CONSERTOS - PREVISTOS X RECEBIDOS' : 'COMPRAS - PREVISTOS X RECEBIDOS'
      )
    );
  } else {
    $('#crudMesChartSection')?.classList.add('hidden');
    destroyCrudMesChart();
  }
  renderAlertas();
}

function renderAlertas() {
  const el = $('#alertasLista');
  if (!el) return;
  const atrasados = registrosAtrasados(getFiltrados()).slice(0, 8);
  if (!atrasados.length) {
    el.innerHTML = '<p class="muted">Nenhum item atrasado no filtro atual.</p>';
    return;
  }
  el.innerHTML = atrasados
    .map(
      (r) => `
    <button type="button" class="alerta-item" data-id="${r.id}">
      <span>${r.item?.slice(0, 42) || '—'}</span>
      <small>${r.previsao_entrega} · ${r.status}</small>
    </button>`
    )
    .join('');
  el.querySelectorAll('.alerta-item').forEach((b) =>
    b.addEventListener('click', () => abrirModal(b.dataset.id))
  );
}

function showView(name) {
  viewAtual = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('nav.tabs button, .nav-item').forEach((b) => b.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  document.querySelectorAll(`[data-tab="${name}"]`).forEach((el) => el.classList.add('active'));

  const crud = ['rc', 'consertos', 'compras'].includes(name);
  const isDash = name === 'dashboard';
  const isSpecial = ['fornecedores', 'calendario'].includes(name);

  // Seção tabela (toolbar + tabela de RCs)
  $('#secaoTabela')?.classList.toggle('hidden', !crud);

  // KPIs e filtros — ocultos nas views especiais
  document.querySelector('.kpi-grid')?.classList.toggle('hidden', isSpecial);
  document.querySelector('.filters.panel')?.classList.toggle('hidden', isSpecial);

  // Dashboard e alertas
  $('#secaoDashboard')?.classList.toggle('hidden', !isDash);
  $('#secaoAlertas')?.classList.toggle('hidden', !isDash);

  document.body.classList.toggle('view-crud', crud);

  if (name === 'fornecedores') {
    renderFornecedoresSLA();
  } else if (name === 'calendario') {
    updateCalendario(registros);
  }

  const titles = {
    dashboard: 'Visão Geral',
    rc: 'Controle Global',
    consertos: 'Consertos',
    compras: 'Compras',
    fornecedores: 'SLA Fornecedores',
    calendario: 'Calendário',
  };
  const topbarTitle = $('#topbarTitle');
  if (topbarTitle && titles[name]) topbarTitle.textContent = titles[name];

  const t = $('#crudTitle');
  if (t && titles[name]) t.textContent = titles[name];

  refresh();
}

function abrirModal(id) {
  const naturezaPadrao = {
    consertos: 'CONSERTO',
    compras: 'COMPRA',
    rc: 'CONSERTO',
  };
  editando = id
    ? registros.find((r) => r.id === id)
    : {
        natureza: naturezaPadrao[viewAtual] || 'CONSERTO',
        item_id: proximoItemId(registros, naturezaPadrao[viewAtual] || 'CONSERTO'),
        valor: 0,
      };
  if (!editando) return;

  const f = $('#formRegistro');
  const fields = [
    'sinal', 'item_id', 'natureza', 'item', 'descricao_falha', 'solicitante', 'criticidade',
    'linha', 'maquina', 'fornecedor', 'nf_saida', 'data_saida', 'orcamento', 'rc', 'po',
    'valor', 'previsao_entrega', 'data_recebimento', 'comentario',
  ];
  fields.forEach((name) => {
    const input = f.elements.namedItem(name);
    if (!input) return;
    const v = editando[name];
    input.value = v ?? '';
  });

  // Render Foto
  fotoUrlAtual = editando.foto_url || null;
  const preview = $('#fotoPreview');
  const placeholder = $('#fotoPlaceholder');
  const btnRemover = $('#btnRemoverFoto');
  
  if (fotoUrlAtual) {
    preview.src = fotoUrlAtual;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    btnRemover.style.display = 'inline-flex';
    $('#fotoPreviewWrap').style.cursor = 'pointer';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    btnRemover.style.display = 'none';
    $('#fotoPreviewWrap').style.cursor = 'default';
  }

  const irmas = editando.item_id != null ? registrosDoMesmoItem(registros, editando.item_id) : [];
  const hintId =
    irmas.length > 1
      ? `<p class="form-hint">ID ${editando.item_id}: ${irmas.length} linhas neste item (como na planilha Excel).</p>`
      : '';
  $('#formIdHint').innerHTML = hintId;

  if (editando.id) {
    const calc = enriquecerRegistro(editando);
    $('#calcPreview').innerHTML = `
      <div><span>Status</span><strong>${calc.status}</strong></div>
      <div><span>V. Previsto</span><strong>${calc.valor_previsto ?? '—'}</strong></div>
      <div><span>V. Recebido</span><strong>${calc.valor_recebido ?? '—'}</strong></div>
      <div><span>Mês ref.</span><strong>${calc.mes_referencia ?? '—'}</strong></div>
      <div><span>Máq./Linha</span><strong>${calc.maquina_linha || '—'}</strong></div>
      <div><span>Dias fora</span><strong>${calc.dias_fora ?? '—'}</strong></div>`;
  } else {
    $('#calcPreview').innerHTML = '<p class="muted">Campos calculados aparecem após salvar.</p>';
  }

  $('#btnExcluirModal').style.display = editando.id ? 'inline-flex' : 'none';
  $('#modalTitulo').textContent = id ? 'Editar registro' : 'Novo registro';
  $('#modal').classList.add('open');
}

async function salvarForm(e) {
  e.preventDefault();
  const f = $('#formRegistro');
  const payload = {
    ...editando,
    sinal: f.sinal.value || null,
    item_id: f.item_id.value ? parseInt(f.item_id.value, 10) : null,
    natureza: normalizarNatureza(f.natureza.value),
    item: f.elements.namedItem('item').value, // Fix item empty bug
    descricao_falha: f.descricao_falha.value,
    solicitante: f.solicitante.value,
    criticidade: f.criticidade.value || null,
    linha: f.linha.value,
    maquina: f.maquina.value,
    fornecedor: f.fornecedor.value,
    nf_saida: f.nf_saida.value,
    data_saida: f.data_saida.value || null,
    orcamento: f.orcamento.value,
    rc: f.rc.value,
    po: f.po.value,
    valor: parseFloat(f.valor.value) || 0,
    previsao_entrega: f.previsao_entrega.value || null,
    data_recebimento: f.data_recebimento.value || null,
    comentario: f.comentario.value,
    foto_url: fotoUrlAtual, // Add photo to payload
  };
  try {
    await salvarRegistro(payload);
    registros = await carregarRegistros();
    $('#modal').classList.remove('open');
    toast('Registro salvo com sucesso.', 'success');
    renderFiltros();
    refresh();
  } catch (err) {
    toast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function excluir(id) {
  if (!confirmar('Excluir este registro permanentemente?')) return;
  try {
    await excluirRegistro(id);
    registros = await carregarRegistros();
    toast('Registro excluído.', 'success');
    refresh();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function duplicar(id) {
  try {
    await duplicarRegistro(id);
    registros = await carregarRegistros();
    toast('Registro duplicado.', 'success');
    renderFiltros();
    refresh();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function marcarEntregue() {
  if (!editando?.id) return;
  const f = $('#formRegistro');
  f.data_recebimento.value = new Date().toISOString().slice(0, 10);
  toast('Data de recebimento preenchida. Salve para confirmar.', 'info');
}

function atualizarBotaoEdicao() {
  const btn = $('#btnInlineEdit');
  if (!btn) return;
  if (isInlineEditMode) {
    btn.style.background = 'var(--danger)';
    btn.style.color = '#ffffff';
    btn.style.fontWeight = '700';
    btn.style.borderColor = 'var(--danger)';
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg><span style="pointer-events:none">Sair da Edição</span>`;
  } else {
    btn.style.background = 'transparent';
    btn.style.color = 'var(--text)';
    btn.style.fontWeight = '500';
    btn.style.borderColor = 'rgba(255,255,255,0.2)';
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span style="pointer-events:none">Modo Edição</span>`;
  }
}

async function init() {
  try {
    registros = await carregarRegistros();
  } catch (e) {
    console.error("Initialization error:", e);
    toast('Modo Offline: Não foi possível baixar registros (' + e.message + ')', 'warning');
    registros = []; // Fallback gracefully to allow app to finish initializing UI
  }

  $('#appStatus').innerHTML = `<span class="dot-online"></span> ${registros.length} registros`;

  $('#filtroStatus').innerHTML = `<option value="TODOS">TODOS</option>`;
  STATUS_LIST.forEach((s) => {
    $('#filtroStatus').innerHTML += `<option value="${s}">${s}</option>`;
  });
  
  $('#filtroCriticidade').innerHTML = `<option value="TODOS">TODOS</option>`;
  CRITICIDADE_LIST.forEach((c) => {
    $('#filtroCriticidade').innerHTML += `<option value="${c}">${c}</option>`;
  });

  renderFiltros();

  subscribeToRealtime((payload) => {
    if (!payload || !payload.eventType) return;
    let changed = false;
    
    if (payload.eventType === 'INSERT') {
      const idx = registros.findIndex(r => r.id === payload.new.id);
      if (idx === -1) {
        registros.push(enriquecerRegistro(payload.new));
        changed = true;
      }
    } else if (payload.eventType === 'UPDATE') {
      const idx = registros.findIndex(r => r.id === payload.new.id);
      if (idx !== -1) {
        registros[idx] = enriquecerRegistro(payload.new);
        changed = true;
      } else {
        registros.push(enriquecerRegistro(payload.new));
        changed = true;
      }
    } else if (payload.eventType === 'DELETE') {
      const oldLen = registros.length;
      registros = registros.filter(r => r.id !== payload.old.id);
      if (registros.length < oldLen) changed = true;
    }
    
    if (changed) {
      // Shield 1: Check if the user is editing the exact same row in the Modal
      const isModalOpen = $('#modal').classList.contains('open');
      if (isModalOpen && editando?.id === payload.new?.id) {
        toast('⚠️ Atenção: O registro que você está editando acabou de ser modificado por outro usuário.', 'warning');
      }

      // Shield 2: Check if there is an active inline edit (prevent UI destruction)
      const isInlineEditing = !!document.querySelector('.inline-edit-input');
      
      clearTimeout(window._realtimeDebounce);
      window._realtimeDebounce = setTimeout(() => {
        if (isInlineEditing) {
          $('#appStatus').innerHTML = `<span class="dot-online" style="background:var(--warning)"></span> ${registros.length} registros (Atualização pendente)`;
          toast('Mudanças de outros usuários recebidas. Termine de editar para atualizar a tela.', 'info');
        } else {
          $('#appStatus').innerHTML = `<span class="dot-online"></span> ${registros.length} registros`;
          refresh();
          toast('Tabela sincronizada (tempo real)', 'success');
        }
      }, 400); // Shield 3: Debounce to prevent UI freezing on massive bulk updates
    }
  });
  setDrilldownEditHandler((id) => abrirModal(id));
  setDrilldownPhotoHandler(async (id, dataUrl) => {
    const r = registros.find((x) => x.id === id);
    if (!r) return;
    try {
      await salvarRegistro({ ...r, foto_url: dataUrl });
      registros = await carregarRegistros();
      toast('Mídia da RC atualizada.', 'success');
      refresh();
    } catch (err) {
      toast('Erro ao atualizar mídia: ' + err.message, 'error');
    }
  });

  const cardAtrasados = $('#kpiCardAtrasados');
  cardAtrasados?.addEventListener('click', () => {
    if (cardAtrasados.getAttribute('aria-disabled') === 'true') {
      toast('Nenhum item atrasado no filtro atual.', 'info');
      return;
    }
    abrirPainelAtrasados();
  });
  cardAtrasados?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (cardAtrasados.getAttribute('aria-disabled') === 'true') {
      toast('Nenhum item atrasado no filtro atual.', 'info');
      return;
    }
    abrirPainelAtrasados();
  });

  document.querySelectorAll('nav.tabs button, [data-tab].nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.tab));
  });

  const onFilter = () => {
    filtros = {
      natureza: $('#filtroNatureza').value,
      status: $('#filtroStatus').value,
      criticidade: $('#filtroCriticidade').value,
      linha: $('#filtroLinha').value,
      maquina: $('#filtroMaquina').value,
      fornecedor: $('#filtroFornecedor').value,
      busca: $('#filtroBusca').value,
    };
    refresh();
  };

  ['#filtroNatureza', '#filtroStatus', '#filtroCriticidade', '#filtroLinha', '#filtroMaquina', '#filtroFornecedor', '#filtroBusca'].forEach(
    (sel) => {
      $(sel)?.addEventListener('change', onFilter);
      $(sel)?.addEventListener('input', onFilter);
    }
  );

  $('#btnRowDetalhe')?.addEventListener('click', () => {
    if (linhaSelecionadaId) abrirDetalhe(linhaSelecionadaId);
  });
  $('#btnRowEditar')?.addEventListener('click', () => {
    if (linhaSelecionadaId) abrirModal(linhaSelecionadaId);
  });
  $('#btnRowDuplicar')?.addEventListener('click', () => {
    if (linhaSelecionadaId) duplicar(linhaSelecionadaId);
  });
  $('#btnRowExcluir')?.addEventListener('click', () => {
    if (linhaSelecionadaId) excluir(linhaSelecionadaId);
  });

  // Botão Modo Edição Inline
  $('#btnInlineEdit')?.addEventListener('click', () => {
    isInlineEditMode = !isInlineEditMode;
    atualizarBotaoEdicao();
    renderTabela();
    if (isInlineEditMode) {
      toast('Modo edição ativado. Clique nas células destacadas para editar.', 'success');
    } else {
      toast('Modo edição desativado.', 'info');
    }
  });

  $('#btnNovo').addEventListener('click', () => abrirModal(null));
  $('#btnExport').addEventListener('click', () => exportarExcel(getFiltrados(), viewAtual));
  
  // Exportação em PDF com templates profissionais
  $('#btnExportDashboardPdf')?.addEventListener('click', () => {
    import('./pdf_report.js?v=' + Date.now()).then(m => {
      m.gerarRelatorioExecutivoPDF(registros).catch(e => alert('Erro interno Executivo: ' + e.message));
    }).catch(err => {
      console.error('Erro ao carregar módulo PDF:', err);
      alert('Erro de Importação PDF: ' + err.message + '\\n' + err.stack);
    });
  });

  $('#btnExportSlaPdf')?.addEventListener('click', () => {
    import('./pdf_report.js?v=' + Date.now()).then(m => {
      m.gerarRelatorioSLAPDF(registros).catch(e => alert('Erro interno SLA: ' + e.message));
    }).catch(err => {
      console.error('Erro ao carregar módulo PDF:', err);
      alert('Erro de Importação SLA: ' + err.message + '\\n' + err.stack);
    });
  });

  $('#btnLimparFiltros').addEventListener('click', () => {
    filtros = { natureza: 'TODOS', status: 'TODOS', criticidade: 'TODOS', linha: 'TODOS', maquina: 'TODOS', fornecedor: 'TODOS', busca: '' };
    document.querySelectorAll('.filters select, .filters input').forEach((el) => {
      if (el.type === 'search') el.value = '';
      else if (el.tagName === 'SELECT') el.value = 'TODOS';
    });
    refresh();
  });
  $('#btnFecharModal').addEventListener('click', () => $('#modal').classList.remove('open'));
  $('#btnCancelarModal')?.addEventListener('click', () => $('#modal').classList.remove('open'));
  $('#btnExcluirModal').addEventListener('click', async () => {
    if (editando?.id) {
      $('#modal').classList.remove('open');
      await excluir(editando.id);
    }
  });
  $('#btnMarcarEntregue').addEventListener('click', marcarEntregue);
  $('#btnProximoId')?.addEventListener('click', () => {
    const f = $('#formRegistro');
    if (f?.item_id) f.item_id.value = proximoItemId(registros, f.natureza.value);
  });
  $('#formRegistro').addEventListener('submit', salvarForm);
  $('#drillFechar').addEventListener('click', fecharDrilldown);
  $('#drillOverlay').addEventListener('click', fecharDrilldown);

  // Foto listeners no CRUD modal
  $('#inputFoto')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 2 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      fotoUrlAtual = reader.result;
      const preview = $('#fotoPreview');
      preview.src = fotoUrlAtual;
      preview.style.display = 'block';
      $('#fotoPlaceholder').style.display = 'none';
      $('#btnRemoverFoto').style.display = 'inline-flex';
      $('#fotoPreviewWrap').style.cursor = 'pointer';
    };
    reader.readAsDataURL(file);
  });

  $('#btnRemoverFoto')?.addEventListener('click', () => {
    fotoUrlAtual = null;
    const preview = $('#fotoPreview');
    preview.src = '';
    preview.style.display = 'none';
    $('#fotoPlaceholder').style.display = 'block';
    $('#btnRemoverFoto').style.display = 'none';
    $('#inputFoto').value = '';
    $('#fotoPreviewWrap').style.cursor = 'default';
  });

  // Lightbox genérico (expansão de imagem)
  const openLightbox = (src) => {
    if (!src) return;
    const lb = $('#lightboxOverlay');
    const lbImg = $('#lightboxImg');
    if (lb && lbImg) {
      lbImg.src = src;
      lb.classList.add('open');
    }
  };
  
  $('#fotoPreviewWrap')?.addEventListener('click', () => openLightbox(fotoUrlAtual));

  // Ocultar lightbox
  $('#lightboxOverlay')?.addEventListener('click', (e) => {
    $('#lightboxOverlay').classList.remove('open');
    $('#lightboxImg').src = '';
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('drill-foto-img')) {
      openLightbox(e.target.src);
    }
  });

  atualizarBotaoEdicao();
  showView('dashboard');
}

// ========== Login / Auth handlers ==========
// Helpers de Login Visual
function showLoginAlert(msg, type = 'error') {
  const alertEl = document.getElementById('loginAlert');
  if (!alertEl) {
    toast(msg, type); // Fallback
    return;
  }

  // Reseta a classe (retira ao estado oculto via CSS transition)
  alertEl.className = 'login-alert';
  alertEl.textContent = msg;

  // Um frame depois aplica o tipo para disparar a transição CSS
  requestAnimationFrame(() => {
    alertEl.className = 'login-alert ' + type;
  });

  if (type === 'error') {
    const wrapper = document.querySelector('.login-wrapper');
    if (wrapper) {
      wrapper.classList.remove('shake');
      void wrapper.offsetWidth;
      wrapper.classList.add('shake');
    }
  }
}

function translateAuthError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('user already registered')) return 'Este e-mail já está em uso.';
  if (msg.includes('password should be at least')) return 'A senha deve ter no mínimo 6 caracteres.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento.';
  return 'Falha na autenticação. Verifique os dados.';
}

document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const senhaInput = document.getElementById('loginSenha');
  
  emailInput.classList.remove('input-error');
  senhaInput.classList.remove('input-error');
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) alertEl.className = 'login-alert'; // esconde o alert
  
  const email = emailInput.value.trim();
  const senha = senhaInput.value;
  const btn = e.target.querySelector('button[type="submit"]');
  
  btn.disabled = true;
  btn.textContent = 'Autenticando...';
  
  try {
    await signIn(email, senha);
  } catch (err) {
    showLoginAlert(translateAuthError(err), 'error');
    emailInput.classList.add('input-error');
    senhaInput.classList.add('input-error');
    btn.disabled = false;
    btn.textContent = 'Entrar na Conta';
  }
});

document.getElementById('formCadastro')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('cadNome')?.value.trim();
  const emailInput = document.getElementById('cadEmail');
  const senhaInput = document.getElementById('cadSenha');
  const btn = e.target.querySelector('button[type="submit"]');
  
  emailInput.classList.remove('input-error');
  senhaInput.classList.remove('input-error');
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) alertEl.className = 'login-alert';

  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    await signUp(emailInput.value.trim(), senhaInput.value, nome);
    showLoginAlert('Conta criada com sucesso! Faça login abaixo.', 'success');
    document.getElementById('cadEmail').value = '';
    document.getElementById('cadSenha').value = '';
    if (document.getElementById('cadNome')) document.getElementById('cadNome').value = '';
    document.getElementById('loginEmail').value = emailInput.value.trim();
    
    // Switch to login form smoothly
    setTimeout(() => {
      const fCad = document.getElementById('formCadastro');
      const fLog = document.getElementById('formLogin');
      const p = document.querySelector('.login-footer p');
      const btnToggle = document.getElementById('btnToggleCadastro');
      
      fCad.style.display = 'none';
      fLog.style.display = 'flex';
      if (btnToggle) btnToggle.textContent = 'Criar nova conta agora';
      if (p) p.textContent = 'Ainda não possui acesso?';
    }, 2000);

  } catch (err) {
    showLoginAlert(translateAuthError(err), 'error');
    emailInput.classList.add('input-error');
    senhaInput.classList.add('input-error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Registrar Acesso';
  }
});

document.getElementById('btnToggleCadastro')?.addEventListener('click', (e) => {
  const fCad = document.getElementById('formCadastro');
  const fLog = document.getElementById('formLogin');
  const btn = e.currentTarget;
  const p = document.querySelector('.login-footer p');
  if (fCad.style.display === 'none') {
    fCad.style.display = 'flex';
    fLog.style.display = 'none';
    btn.textContent = 'Já tenho uma conta';
    if (p) p.textContent = 'Já tem acesso?';
  } else {
    fCad.style.display = 'none';
    fLog.style.display = 'flex';
    btn.textContent = 'Ainda não possui acesso? Registrar';
    if (p) p.textContent = 'Ainda não possui acesso?';
  }
});

document.getElementById('btnSair')?.addEventListener('click', async () => {
  await signOut();
});

function renderFornecedoresSLA() {
  let dados = agregarFornecedores(registros);
  const tbody = document.getElementById('tabelaFornecedores');
  if (!tbody) return;

  // Atualizar KPIs
  const elTotal = document.getElementById('slaKpiTotal');
  const elPont = document.getElementById('slaKpiPontualidade');
  const elAtraso = document.getElementById('slaKpiAtraso');
  const elDestaque = document.getElementById('slaKpiDestaque');

  if (dados.length === 0) {
    if (elTotal) elTotal.textContent = '0';
    if (elPont) elPont.textContent = '0%';
    if (elAtraso) elAtraso.textContent = '0 dias';
    if (elDestaque) elDestaque.textContent = '-';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 2rem;">Nenhum item recebido para calcular SLA.</td></tr>';
    return;
  }

  // Ordenar por pontualidade desc, depois atraso asc
  dados.sort((a, b) => {
    if (b.pontualidade !== a.pontualidade) return b.pontualidade - a.pontualidade;
    return a.mediaAtraso - b.mediaAtraso;
  });

  if (elTotal) elTotal.textContent = dados.length;
  
  const somaPontualidade = dados.reduce((acc, d) => acc + d.pontualidade, 0);
  const pontMedia = somaPontualidade / dados.length;
  if (elPont) elPont.textContent = pontMedia.toFixed(1) + '%';
  
  const somaAtrasos = dados.reduce((acc, d) => acc + d.mediaAtraso, 0);
  const atrasoMedio = somaAtrasos / dados.length;
  if (elAtraso) elAtraso.textContent = atrasoMedio.toFixed(1) + ' dias';

  // Destaque = 100% de pontualidade com maior volume. Se no houver 100%, pega o com maior pontualidade.
  const destaque = dados.reduce((prev, current) => {
    if (!prev) return current;
    if (current.pontualidade > prev.pontualidade) return current;
    if (current.pontualidade === prev.pontualidade && current.entregues > prev.entregues) return current;
    return prev;
  }, null);
  
  if (elDestaque) elDestaque.textContent = destaque ? destaque.fornecedor : '-';

  tbody.innerHTML = dados.map(d => {
    let badgeClass = 'badge-sla';
    let icone = '';
    
    if (d.status === 'Excelente') { badgeClass = 'badge-sla-excelente'; icone = '🌟 '; }
    else if (d.status === 'Bom') { badgeClass = 'badge-sla-bom'; icone = '🟢 '; }
    else if (d.status === 'Regular') { badgeClass = 'badge-sla-regular'; icone = '🟡 '; }
    else if (d.status === 'Ruim') { badgeClass = 'badge-sla-ruim'; icone = '🔴 '; }

    // Cor da barra de progresso
    let progressColor = '#34d399'; // excelente
    if (d.pontualidade < 95) progressColor = '#3b82f6'; // bom
    if (d.pontualidade < 85) progressColor = '#f59e0b'; // regular
    if (d.pontualidade < 70) progressColor = '#ef4444'; // ruim

    return `
      <tr style="cursor: pointer;" data-forn="${d.fornecedor.replace(/"/g, '&quot;')}">
        <td style="font-weight: 500; color: var(--text);">${d.fornecedor}</td>
        <td>${d.entregues} itens</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 600;">${d.pontualidade.toFixed(1)}%</span>
            <div class="sla-progress-wrap" style="width: 80px;">
              <div class="sla-progress-fill" style="width: ${d.pontualidade}%; background: ${progressColor};"></div>
            </div>
          </div>
        </td>
        <td>${d.mediaAtraso > 0 ? `<span style="color: var(--danger); font-weight: 500;">${d.mediaAtraso.toFixed(1)} dias</span>` : '<span style="color: var(--muted);">Sem atraso</span>'}</td>
        <td><span class="badge-sla ${badgeClass}">${icone}${d.status}</span></td>
      </tr>
    `;
  }).join('');

    // Adicionar click para filtrar a tabela global pelo fornecedor
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const forn = tr.dataset.forn;
        const apenasDesteForn = registros.filter(r => r.fornecedor === forn);
        const atrasadosForn = registrosAtrasados(apenasDesteForn);
        
        if (atrasadosForn.length === 0) {
           toast('Este fornecedor não possui itens em atraso.', 'info');
           return;
        }

        const total = atrasadosForn.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        abrirDrilldown({
          titulo: `Atrasados: ${forn}`,
          subtitulo: `${atrasadosForn.length} registro(s) com previsão de entrega vencida`,
          registros: atrasadosForn,
          meta: {
            insight: `Valor total em atraso: ${fmtMoeda(total)}. Itens pendentes na conta deste fornecedor.`
          }
        });
      });
    });
}

// Initialize Excel Import feature
initExcelImport(getClient(), toast, async () => {
  registros = await carregarRegistros();
  window.location.reload();
});

window.addEventListener('DOMContentLoaded', async () => {
  // Se veio do inicializador (.bat), forçamos o deslogue (tela de login garantida ao executar)
  const params = new URLSearchParams(window.location.search);
  if (params.get('login') === 'force') {
    try {
      await signOut();
    } catch(e) {}
    // Remove o parâmetro da URL sem recarregar a página para que o F5 não deslogue
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({path: cleanUrl}, '', cleanUrl);
  }

  onAuthStateChange((user) => {
    if (user) {
      document.getElementById('login-container').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';

      // ── Painel de usuário ──────────────────────────────────────
      const rawName = user.user_metadata?.username
                   || user.user_metadata?.name
                   || user.email?.split('@')[0]
                   || 'Usuário';

      // Formata nome: capitaliza cada palavra
      const displayName = rawName
        .split(/[\s._]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      // Saudação por hora
      const hora = new Date().getHours();
      const greeting = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

      // Inicial do avatar (primeira letra do primeiro nome)
      const initial = displayName.charAt(0).toUpperCase();

      // Sidebar
      const elAvatar   = document.getElementById('userAvatar');
      const elGreeting = document.getElementById('userGreeting');
      const elName     = document.getElementById('userName');
      if (elAvatar)   elAvatar.textContent   = initial;
      if (elGreeting) elGreeting.textContent = greeting;
      if (elName)     elName.textContent     = displayName;

      // Topbar badge
      const elTopbarBadge = document.getElementById('topbarUserBadge');
      const elTopbarName  = document.getElementById('topbarUserName');
      if (elTopbarName)  elTopbarName.textContent  = `${greeting}, ${displayName.split(' ')[0]}`;
      if (elTopbarBadge) elTopbarBadge.style.display = 'flex';
      // ──────────────────────────────────────────────────────────

      if (!isAppInitialized) {
        isAppInitialized = true;
        init().then(() => {
          initCalendario(registros);
        });
      }
    } else {
      isAppInitialized = false;
      document.getElementById('login-container').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';

      // Limpa painel
      const elTopbarBadge = document.getElementById('topbarUserBadge');
      if (elTopbarBadge) elTopbarBadge.style.display = 'none';
    }
  });
});
