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
} from './logic.js';
import { carregarRegistros, salvarRegistro, excluirRegistro, duplicarRegistro } from './db.js';
import { renderDashboardCharts } from './charts.js?v=4';
import {
  COLUNAS_TABELA,
  valorCelula,
  exportarCSV,
  toast,
  confirmar,
  fmtMoeda,
} from './ui.js';
import { abrirDrilldown, fecharDrilldown, setDrilldownEditHandler } from './drilldown.js';

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

const $ = (sel) => document.querySelector(sel);

function getFiltrados() {
  let base = registros;
  if (viewAtual === 'consertos') base = base.filter((r) => r.natureza === 'CONSERTO');
  if (viewAtual === 'compras') base = base.filter((r) => r.natureza === 'COMPRA');
  if (viewAtual === 'fabricacao') base = base.filter((r) => r.natureza === 'FABRICACAO');
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
      ${COLUNAS_TABELA.map((c) => `<td title="${r[c.key] ?? ''}">${valorCelula(r, c)}</td>`).join('')}
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => selecionarLinha(tr.dataset.id));
    tr.addEventListener('dblclick', (e) => {
      e.preventDefault();
      abrirDetalhe(tr.dataset.id);
    });
  });

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
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  $(`[data-tab="${name}"]`)?.classList.add('active');

  const crud = ['rc', 'consertos', 'compras', 'fabricacao'].includes(name);
  $('#secaoTabela').classList.toggle('hidden', !crud);
  const isDash = name === 'dashboard';
  $('#secaoDashboard')?.classList.toggle('hidden', !isDash);
  $('#secaoAlertas')?.classList.toggle('hidden', !isDash);

  document.body.classList.toggle('view-crud', crud);

  const titles = {
    rc: 'Controle RC',
    consertos: 'Consertos',
    compras: 'Compras',
    fabricacao: 'Fabricação',
  };
  const t = $('#crudTitle');
  if (t && titles[name]) t.textContent = titles[name];

  refresh();
}

function abrirModal(id) {
  const naturezaPadrao = {
    consertos: 'CONSERTO',
    compras: 'COMPRA',
    fabricacao: 'FABRICACAO',
    rc: 'CONSERTO',
  };
  editando = id
    ? registros.find((r) => r.id === id)
    : {
        natureza: naturezaPadrao[viewAtual] || 'CONSERTO',
        item_id: proximoItemId(registros),
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
    const input = f.elements[name];
    if (!input) return;
    const v = editando[name];
    input.value = v ?? '';
  });

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
    item: f.item.value,
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

async function init() {
  try {
    registros = await carregarRegistros();
  } catch (e) {
    $('#appStatus').textContent = 'Erro: ' + e.message;
    return;
  }

  $('#appStatus').innerHTML = `<span class="dot-online"></span> ${registros.length} registros · Supabase`;

  STATUS_LIST.forEach((s) => {
    $('#filtroStatus').innerHTML += `<option value="${s}">${s}</option>`;
  });
  CRITICIDADE_LIST.forEach((c) => {
    $('#filtroCriticidade').innerHTML += `<option value="${c}">${c}</option>`;
  });

  renderFiltros();
  setDrilldownEditHandler((id) => abrirModal(id));

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

  document.querySelectorAll('nav.tabs button').forEach((btn) => {
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

  $('#btnNovo').addEventListener('click', () => abrirModal(null));
  $('#btnExport').addEventListener('click', () => exportarCSV(getFiltrados(), viewAtual));
  $('#btnLimparFiltros').addEventListener('click', () => {
    filtros = { natureza: 'TODOS', status: 'TODOS', criticidade: 'TODOS', linha: 'TODOS', maquina: 'TODOS', fornecedor: 'TODOS', busca: '' };
    document.querySelectorAll('.filters select, .filters input').forEach((el) => {
      if (el.type === 'search') el.value = '';
      else if (el.tagName === 'SELECT') el.value = 'TODOS';
    });
    refresh();
  });
  $('#btnFecharModal').addEventListener('click', () => $('#modal').classList.remove('open'));
  $('#btnExcluirModal').addEventListener('click', async () => {
    if (editando?.id) {
      $('#modal').classList.remove('open');
      await excluir(editando.id);
    }
  });
  $('#btnMarcarEntregue').addEventListener('click', marcarEntregue);
  $('#btnProximoId')?.addEventListener('click', () => {
    const f = $('#formRegistro');
    if (f?.item_id) f.item_id.value = proximoItemId(registros);
  });
  $('#formRegistro').addEventListener('submit', salvarForm);
  $('#drillFechar').addEventListener('click', fecharDrilldown);
  $('#drillOverlay').addEventListener('click', fecharDrilldown);

  showView('dashboard');
}

init();
