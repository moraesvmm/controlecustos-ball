import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_LOCAL_DATA, GITHUB_PAT, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_WORKFLOW_ID } from './config.js?v=4';
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
  calcularDiasFora
} from './logic.js';
import { initCalendario, updateCalendario } from './calendario.js';
import { 
carregarRegistros, salvarRegistro, excluirRegistro, duplicarRegistro, signIn, signUp, signOut, onAuthStateChange, 
getClient, carregarPreventiva, salvarPreventiva, excluirPreventiva, getMachines, getMachineActivities, createMachine, 
createMachineActivity, getFornecedoresContatos, upsertFornecedorContato,
getTarefasDelegadas, criarTarefaDelegada, atualizarStatusTarefa, initRealtimeSync } from './db.js?v=14';
import { renderDashboardCharts, renderCrudMesChart, destroyCrudMesChart, renderConsertoFluxoChart, destroyFluxoChart } from './charts.js';
import {
  COLUNAS_TABELA,
  valorCelula,
  exportarExcel,
  toast,
  confirmar,
  fmtMoeda,
} from './ui.js';
import { abrirDrilldown, fecharDrilldown, setDrilldownEditHandler, setDrilldownPhotoHandler, setDrilldownViewHandler } from './drilldown.js?v=4';
import { initExcelImport } from './import_excel.js';

import { initExcelImportPreventiva, initExcelImportPreventivaFrontend } from './import_excel_preventiva.js';

import { gerarRelatorioExecutivoPDF, gerarRelatorioSLAPDF, gerarChecklistLinhaPDF, gerarChecklistRetomadaPDF } from './pdf_report.js?v=17';
window.gerarChecklistRetomadaPDF = gerarChecklistRetomadaPDF;

import { initPlanoMestre } from './plano_mestre.js';
import { initImportPlanoMestre } from './import_plano_mestre.js';
import { renderPrevisoes } from './previsoes.js';
import { initAlertas, toggleAlertasPanel } from './alertas.js';
import { initCopiloto } from './copiloto.js';
import { initIndicadores, initConfiabilidade } from './indicadores.js?v=3';

let registros = [];

let registrosPreventiva = [];

Object.defineProperty(window, '_registrosPreventiva', { get: () => registrosPreventiva });
window.fornecedoresContatosData = [];

// =============================
// GESTÃO DE TAREFAS DELEGADAS
// =============================
let tarefasDelegadas = [];
Object.defineProperty(window, '_tarefasDelegadas', { get: () => tarefasDelegadas });
let intervalTarefas = null;

const usersHierarchy = {
  'Vitor Moraes': { role: 'ADM', budget_areas: [] }, 
  'João Silva': { role: 'Master', budget_areas: [] },
  'Vinicius Marques': { role: 'Master', budget_areas: ['materiais_reparo', 'debito_direto'] },
  'Gelcino Júnior': { role: 'Master', budget_areas: [] },
  'Victor Mello': { role: 'Pupil', budget_areas: ['materiais_reparo', 'debito_direto'] },
  'Beatriz Moraes': { role: 'Pupil', budget_areas: ['materiais_reparo', 'debito_direto'] },
};
const pupilosDisponiveis = ['Victor Mello', 'Beatriz Moraes'];
// =============================
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
let pdfUrlAtual = null;
let isInlineEditMode = false;
let isAppInitialized = false;
let machines = [];
let selectedMachineId = null;
let registrosPreventivaFrontend = []; // Registros com setor = 'frontend'
Object.defineProperty(window, '_registrosPreventivaFrontend', { get: () => registrosPreventivaFrontend });

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
  $('#kpiTotal').classList.remove('skeleton');
  $('#kpiValor').textContent = k.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiValor').classList.remove('skeleton');
  $('#kpiPrevisto').textContent = k.totalPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiPrevisto').classList.remove('skeleton');
  $('#kpiRecebido').textContent = k.totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  $('#kpiRecebido').classList.remove('skeleton');
  $('#kpiAtrasados').textContent = atrasados.length;
  $('#kpiAtrasados').classList.remove('skeleton');

  let diff = 0;
  if (k.totalPrevisto > 0) {
    diff = ((k.totalRecebido / k.totalPrevisto) - 1) * 100;
  }
  const diffEl = $('#kpiPrevRecDiff');
  if (diffEl) {
    diffEl.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
    diffEl.classList.remove('positive', 'negative');
    diffEl.classList.add(diff >= 0 ? 'positive' : 'negative');
  }

  // Lógica das micro-infos premium
  const ticketMedio = k.total > 0 ? (k.totalValor / k.total) : 0;
  const kpiMicroTicket = $('#kpiMicroTicket');
  if (kpiMicroTicket) {
    kpiMicroTicket.style.display = 'inline-block';
    const txt = kpiMicroTicket.querySelector('.micro-text');
    if (txt) {
      txt.innerHTML = `<span style="opacity:0.5; font-weight:400; letter-spacing:0.02em;">Ticket médio</span> &nbsp;<span style="color:var(--text-primary); font-weight:500; opacity:0.9;">${ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
    }
  }

  const prevPerc = k.totalValor > 0 ? (k.totalPrevisto / k.totalValor) * 100 : 0;
  const kpiMicroPrevisto = $('#kpiMicroPrevisto');
  if (kpiMicroPrevisto) {
    kpiMicroPrevisto.style.display = 'inline-block';
    const txt = kpiMicroPrevisto.querySelector('.micro-text');
    if (txt) {
      txt.innerHTML = `<span style="opacity:0.5; font-weight:400; letter-spacing:0.02em;">Representa</span> &nbsp;<span style="color:var(--text-primary); font-weight:500; opacity:0.9;">${prevPerc.toFixed(1)}%</span>`;
    }
  }

  const recPerc = k.totalValor > 0 ? (k.totalRecebido / k.totalValor) * 100 : 0;
  const kpiMicroRecebido = $('#kpiMicroRecebido');
  if (kpiMicroRecebido) {
    kpiMicroRecebido.style.display = 'inline-block';
    const txt = kpiMicroRecebido.querySelector('.micro-text');
    if (txt) {
      txt.innerHTML = `<span style="opacity:0.5; font-weight:400; letter-spacing:0.02em;">Conversão</span> &nbsp;<span style="color:var(--text-primary); font-weight:500; opacity:0.9;">${recPerc.toFixed(1)}%</span>`;
    }
  }

  const riscoAtraso = k.total > 0 ? (atrasados.length / k.total) * 100 : 0;
  const kpiMicroAtrasados = $('#kpiMicroAtrasados');
  if (kpiMicroAtrasados) {
    kpiMicroAtrasados.style.display = 'inline-block';
    const txt = kpiMicroAtrasados.querySelector('.micro-text');
    if (txt) {
      txt.innerHTML = `<span style="opacity:0.5; font-weight:400; letter-spacing:0.02em;">Risco</span> &nbsp;<span style="color:var(--text-primary); font-weight:500; opacity:0.9;">${riscoAtraso.toFixed(1)}%</span>`;
    }
  }

  const badgeEl = $('#kpiPrevRecBadge');
  if (badgeEl) {
      if (diff > 5) {
          badgeEl.textContent = 'OVER BUDGET';
          badgeEl.style.color = '#ef4444';
          badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
          badgeEl.style.background = 'rgba(239, 68, 68, 0.1)';
      } else if (diff < -5) {
          badgeEl.textContent = 'UNDER BUDGET';
          badgeEl.style.color = '#10b981';
          badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          badgeEl.style.background = 'rgba(16, 185, 129, 0.1)';
      } else {
          badgeEl.textContent = 'ON TRACK';
          badgeEl.style.color = '#f59e0b';
          badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          badgeEl.style.background = 'rgba(245, 158, 11, 0.1)';
      }
  }

  const healthScore = k.totalPrevisto > 0 ? Math.min(Math.round((k.totalRecebido / k.totalPrevisto) * 100), 100) : 100;
  const healthScoreEl = $('#healthScoreValue');
  if (healthScoreEl) {
    healthScoreEl.textContent = `${healthScore}/100`;
  }
  
  const healthBadgeEl = $('#healthScoreBadge');
  if (healthBadgeEl) {
      if (healthScore >= 80) {
          healthBadgeEl.textContent = 'LOW RISK';
          healthBadgeEl.style.color = '#10b981';
          healthBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else if (healthScore >= 50) {
          healthBadgeEl.textContent = 'MEDIUM RISK';
          healthBadgeEl.style.color = '#f59e0b';
          healthBadgeEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      } else {
          healthBadgeEl.textContent = 'HIGH RISK';
          healthBadgeEl.style.color = '#ef4444';
          healthBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      }
  }
  
  const insightsList = $('#executiveInsightsList');
  if (insightsList) {
      let insights = [];
      if (k.totalPrevisto > 0) {
          insights.push(`<li><span style="color: var(--muted);">›</span> Execução do Previsto está em <strong style="color: var(--text);">${(k.totalRecebido/k.totalPrevisto * 100).toFixed(1)}%</strong> da meta.</li>`);
      }
      if (atrasados.length > 0) {
          insights.push(`<li><span style="color: var(--muted);">›</span> <strong style="color: var(--danger);">${atrasados.length}</strong> entregas atrasadas estão afetando a confiabilidade.</li>`);
      } else {
          insights.push(`<li><span style="color: var(--muted);">›</span> Nenhuma entrega em atraso identificada.</li>`);
      }
      const pendencias = k.porStatus['PENDENTE DE PEDIDO'] || 0;
      if (pendencias > 0) {
          insights.push(`<li><span style="color: var(--muted);">›</span> <strong style="color: var(--warning);">${pendencias}</strong> ordens bloqueadas na etapa de pedido.</li>`);
      }
      
      insightsList.innerHTML = insights.slice(0, 3).join('') || '<li><span style="color: var(--muted);">›</span> Operação fluindo dentro da normalidade.</li>';
  }

  if (window.renderHeroEcharts) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.renderHeroEcharts(k.totalPrevisto, k.totalRecebido, healthScore);
      }, 50);
    });
  }

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
    if (el.tagName === 'INPUT' && el.getAttribute('list')) {
      const listEl = $('#' + el.getAttribute('list'));
      if (listEl) {
        listEl.innerHTML = opts.map((o) => `<option value="${o}">`).join('');
      }
      if (cur && opts.includes(cur)) {
        el.value = cur;
      } else {
        el.value = extra[0] || 'TODOS';
      }
    } else {
      el.innerHTML = opts.map((o) => `<option value="${o}">${o}</option>`).join('');
      if (opts.includes(cur)) el.value = cur;
    }
  };
  setSelect('#filtroNatureza', 'natureza', ['TODOS']);
  setSelect('#filtroLinha', 'linha');
  setSelect('#filtroMaquina', 'maquina');
  setSelect('#filtroFornecedor', 'fornecedor');
}

// ---------- Por Máquina view helpers ----------
function renderMachineList() {
  const ul = $('#machineList');
  if (!ul) return;
  
  const filterVal = $('#geralSetorFilter') ? $('#geralSetorFilter').value : 'todos';
  let sourceActs = [];
  if (filterVal === 'todos') {
     sourceActs = [...registrosPreventiva, ...registrosPreventivaFrontend];
  } else if (filterVal === 'frontend') {
     sourceActs = registrosPreventivaFrontend;
  } else {
     sourceActs = registrosPreventiva;
  }
  
  const todasMaquinas = sourceActs
     .map(r => r.maquina)
     .filter(Boolean);
  const maquinas = [...new Set(todasMaquinas)].sort();
  
  if (maquinas.length === 0) {
    ul.innerHTML = '<li style="color:var(--muted); font-size:0.85rem;">Nenhuma máquina encontrada. Importe a planilha.</li>';
    return;
  }
  
  const htmlGeral = `
    <li data-id="GERAL" class="machine-list-item ${window.selectedMachineId === 'GERAL' ? 'active' : ''}">Geral (Todas)</li>
  `;
  const htmlMaquinas = maquinas.map(m => `
    <li data-id="${m}" class="machine-list-item ${window.selectedMachineId === m ? 'active' : ''}">${m}</li>
  `).join('');
  
  ul.innerHTML = htmlGeral + htmlMaquinas;
  
  ul.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      selectedMachineId = li.dataset.id;
      window.selectedMachineId = selectedMachineId;
      $('#machineTitle').textContent = li.dataset.id === 'GERAL' ? 'Visão Geral (Todas as Atividades)' : `Atividades: ${li.dataset.id}`;
      if ($('#btnAddActivity')) $('#btnAddActivity').style.display = 'inline-block';
      renderMachineActivities();
      
      ul.querySelectorAll('li').forEach(x => x.classList.remove('active'));
      li.classList.add('active');
    });
  });

  if (!selectedMachineId) {
    selectedMachineId = 'GERAL';
    window.selectedMachineId = selectedMachineId;
  }
  let selLi = document.querySelector(`#machineList li[data-id="${selectedMachineId}"]`);
  if (!selLi) {
    selectedMachineId = 'GERAL';
    window.selectedMachineId = 'GERAL';
    selLi = document.querySelector(`#machineList li[data-id="GERAL"]`);
  }
  if (selLi) selLi.click();
}

function renderMachineActivities() {
  if (!selectedMachineId) return;
  
  let acts = [];
  const filterVal = $('#geralSetorFilter') ? $('#geralSetorFilter').value : 'todos';
  let sourceActs = [];
  if (filterVal === 'todos') {
     sourceActs = [...registrosPreventiva, ...registrosPreventivaFrontend];
  } else if (filterVal === 'frontend') {
     sourceActs = registrosPreventivaFrontend;
  } else {
     sourceActs = registrosPreventiva;
  }

  if (selectedMachineId === 'GERAL') {
    acts = sourceActs.filter(r => !r.mes || r.mes === '');
  } else {
    acts = sourceActs.filter(r => r.maquina && r.maquina.toUpperCase() === selectedMachineId.toUpperCase() && (!r.mes || r.mes === ''));
  }

  acts.sort((a, b) => {
    const idA = String(a.identificador || '');
    const idB = String(b.identificador || '');
    return idA.localeCompare(idB, undefined, {numeric: true});
  });
    
  const table = $('#machineActivitiesTable');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  const cols = [];
  if (selectedMachineId === 'GERAL') {
    cols.push({ key: 'maquina', label: 'Máquina' });
  }
  cols.push(
    { key: 'identificador', label: 'Identificador' },
    { key: 'descricao_resumo', label: 'Descrição' },
    { key: 'material', label: 'Material' },
    { key: 'plano_padrao', label: 'Plano Padrão' },
    { key: 'duracao_horas', label: 'Duração (h)' },
    { key: 'hh_mec', label: 'HH Mec' },
    { key: 'hh_eletrico', label: 'HH Elétrico' },
    { key: 'resp_fabrica', label: 'Resp. Fábrica' },
    { key: 'resp_manutencao', label: 'Resp. Manutenção' },
    { key: 'status_auditoria', label: 'Status' },
    { key: 'previsao_custos', label: 'Prev. Custos' },
    { key: 'acoes', label: '' }
  );

  thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;

  if (acts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center; color:var(--muted);">Nenhuma atividade encontrada para esta máquina. Importe a planilha no Navegador Geral.</td></tr>`;
    return;
  }

  tbody.innerHTML = acts.map(a => {
    // Descrição resumida (primeira linha)
    const descLines = (a.atividades_descricoes && Array.isArray(a.atividades_descricoes) && a.atividades_descricoes.length > 0)
      ? a.atividades_descricoes
      : (a.descricao ? [a.descricao] : []);
    const descDisplay = descLines.length > 0 ? descLines.join('<br>') : '-';
    const matDisplay = Array.isArray(a.material) ? a.material.join('<br>') : String(a.material || '-');
    
    const selCls = String(a.id) === String(window.linhaSelecionadaPreventivaId) ? ' row-selected' : '';
    let trHtml = `<tr data-id="${a.id}" class="${selCls}" style="cursor:pointer;" onclick="abrirDetalhePreventivaPanel('${a.id}')">`;
    
    if (selectedMachineId === 'GERAL') {
      trHtml += `<td>${a.maquina || '-'}</td>`;
    }
    
    trHtml += `
      <td><strong>${a.identificador || '-'}</strong></td>
      <td style="min-width: 350px; white-space: normal; line-height: 1.5; padding: 12px; color: var(--text);">${descDisplay}</td>
      <td style="min-width: 200px; white-space: normal; line-height: 1.5; padding: 12px; color: var(--text);">${matDisplay}</td>
      <td><span class="badge ${a.plano_padrao === 'S' ? 'badge-success' : 'badge-warning'}">${a.plano_padrao || '-'}</span></td>
      <td>${a.duracao_horas || '-'}</td>
      <td>${a.hh_mec || '-'}</td>
      <td>${a.hh_eletrico || '-'}</td>
      <td>${a.resp_fabrica || '-'}</td>
      <td>${a.resp_manutencao || '-'}</td>
      <td><span class="badge ${a.status_auditoria === 'FINALIZADO' ? 'badge-success' : a.status_auditoria ? 'badge-warning' : ''}">${a.status_auditoria || '-'}</span></td>
      <td>${Number(a.previsao_custos || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
      <td><button type="button" class="btn-icon" onclick="event.stopPropagation(); abrirDetalhePreventivaPanel('${a.id}')" title="Ver Detalhes" style="background:var(--primary);color:white;padding:0.3rem 0.6rem;border-radius:6px;font-size:0.75rem;white-space:nowrap;">Ver</button></td>
    </tr>`;
    
    return trHtml;
  }).join('');
}
window.renderMachineActivities = renderMachineActivities;

function setupPlanoPreventivaUI() {
  const machineSelect = $('#planoMachineSelect');
  const monthSelect = $('#planoMesSelect');
  const lineSelect = $('#planoLinhaSelect');
  const btnAplicar = $('#btnAplicarPlano');
  const contextoLabel = $('#planoContextoLabel');
  const countLabel = $('#planoAtividadesCount');
  const modalAtiv = $('#modalEditarAtividade');
  let currentActivities = [];
  if (!window.editedPlanoItems) window.editedPlanoItems = new Set();
  if (!window.editedPlanoItems) window.editedPlanoItems = new Set();
  let planoFonte = 'vazio';
  let editandoPlanoIdx = null;

  const planoCols = [
    { key: 'identificador', label: 'Identificador' },
    { key: 'descricao_resumo', label: 'Descrição' },
    { key: 'material', label: 'Material' },
    { key: 'plano_padrao', label: 'Plano Padrão' },
    { key: 'duracao_horas', label: 'Duração (h)' },
    { key: 'hh_mec', label: 'HH Mec' },
    { key: 'hh_eletrico', label: 'HH Elétrico' },
    { key: 'resp_fabrica', label: 'Resp. Fábrica' },
    { key: 'resp_manutencao', label: 'Resp. Manutenção' },
    { key: 'status_auditoria', label: 'Status' },
    { key: 'previsao_custos', label: 'Prev. Custos' },
    { key: 'acoes', label: 'Editar' },
  ];

  const planoThead = $('#planoActivitiesTable thead');
  if (planoThead) {
    planoThead.innerHTML = `<tr>${planoCols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
  }

  const getPlanoContexto = () => ({
    maquina: machineSelect?.value?.trim() || '',
    mes: monthSelect?.value?.trim() || '',
    linha: lineSelect?.value?.trim() || '',
  });

  const contextoCompleto = () => {
    const ctx = getPlanoContexto();
    return ctx.maquina && ctx.mes && ctx.linha;
  };

  const descricaoLinhas = (a) => {
    if (a.atividades_descricoes && Array.isArray(a.atividades_descricoes) && a.atividades_descricoes.length > 0) {
      return a.atividades_descricoes.filter(Boolean);
    }
    return a.descricao ? [a.descricao] : [];
  };

  const cloneAtividadePlano = (a, ctx) => {
    const copy = JSON.parse(JSON.stringify(a));
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.maquina = ctx.maquina;
    copy.mes = ctx.mes;
    copy.linha = ctx.linha;
    return copy;
  };

  const atualizarContextoUI = () => {
    const ctx = getPlanoContexto();
    const ok = contextoCompleto();
    if (btnAplicar) {
      btnAplicar.disabled = !ok || currentActivities.length === 0;
      btnAplicar.title = ok
        ? `Substituir somente ${ctx.maquina} · ${ctx.mes} · ${ctx.linha}`
        : 'Selecione máquina, mês e linha';
    }
    if (contextoLabel) {
      if (ok) {
        const fonteTxt =
          planoFonte === 'aplicado'
            ? 'Plano já aplicado neste contexto (editável antes de reaplicar)'
            : planoFonte === 'template'
              ? 'Template da máquina — edite e aplique somente a este mês/linha'
              : '';
        contextoLabel.style.display = 'block';
        contextoLabel.textContent = `Contexto: ${ctx.maquina} · ${ctx.mes} · ${ctx.linha}${fonteTxt ? ' — ' + fonteTxt : ''}`;
      } else {
        contextoLabel.style.display = 'none';
        contextoLabel.textContent = '';
      }
    }
    if (countLabel) {
      countLabel.textContent = currentActivities.length
        ? `${currentActivities.length} atividade(s) no plano`
        : '';
    }
  };

  const renderPlanoActivitiesTable = () => {
    const tbody = $('#planoActivitiesTable tbody');
    if (!tbody) return;
    const colSpan = planoCols.length;
    const ctx = getPlanoContexto();

    if (!ctx.maquina) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; color:var(--muted); padding:2rem;">Selecione a máquina, o mês e a linha para carregar as atividades.</td></tr>`;
      atualizarContextoUI();
      return;
    }
    if (!ctx.mes || !ctx.linha) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; color:var(--muted); padding:2rem;">Selecione o mês e a linha para definir o contexto do plano.</td></tr>`;
      atualizarContextoUI();
      return;
    }
    if (currentActivities.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; color:var(--muted); padding:2rem;">Nenhuma atividade encontrada. Importe a planilha no Navegador Geral.</td></tr>`;
      atualizarContextoUI();
      return;
    }

    tbody.innerHTML = currentActivities
      .map((a, idx) => {
        const descLines = descricaoLinhas(a);
        const descFull = descLines.join(' | ').replace(/"/g, '&quot;');
        const descStr = String(descLines[0] || '');
        const descDisplay = descLines.length > 0 ? descLines.join('<br>') : '-';
        const mat = Array.isArray(a.material) ? a.material.join('<br>') : String(a.material || '-');
        const isEdited = window.editedPlanoItems && window.editedPlanoItems.has(a.identificador);
        return `<tr ondblclick="abrirModalAtividadePlano(${idx})" style="cursor:pointer; ${isEdited ? 'background-color: rgba(212,175,55,0.08); border-left: 3px solid var(--primary);' : ''}">
          <td style="position: relative;">${isEdited ? '<div class="floatFadeCard">Salvo</div>' : ''}<strong>${a.identificador || '-'}</strong></td>
          <td style="min-width: 300px; white-space: normal; line-height: 1.5; padding: 12px; color: var(--text);">${descDisplay}</td>
          <td style="min-width: 200px; white-space: normal; line-height: 1.5; padding: 12px; color: var(--text);">${mat}</td>
          <td>${a.plano_padrao || '-'}</td>
          <td>${a.duracao_horas ?? '-'}</td>
          <td>${a.hh_mec ?? '-'}</td>
          <td>${a.hh_eletrico ?? '-'}</td>
          <td>${a.resp_fabrica || '-'}</td>
          <td>${a.resp_manutencao || '-'}</td>
          <td>${a.status_auditoria || '-'}</td>
          <td>${Number(a.previsao_custos || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td><button type="button" class="btn btn-ghost btn-sm btn-editar-plano-atividade" data-idx="${idx}" title="Editar atividade">✏️ Editar</button></td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.btn-editar-plano-atividade').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalAtividadePlano(Number(btn.dataset.idx)));
    });
    atualizarContextoUI();
  };

  const carregarAtividadesPlano = () => {
    const ctx = getPlanoContexto();
    currentActivities = [];
    planoFonte = 'vazio';

    if (!ctx.maquina) {
      renderPlanoActivitiesTable();
      return;
    }
    if (!ctx.mes || !ctx.linha) {
      renderPlanoActivitiesTable();
      return;
    }

    const norm = (s) => String(s || '').toUpperCase();
    const noContexto = registrosPreventiva.filter(
      (r) =>
        norm(r.maquina) === norm(ctx.maquina) &&
        String(r.mes || '') === ctx.mes &&
        String(r.linha || '') === ctx.linha
    );

    if (noContexto.length > 0) {
      currentActivities = noContexto.map((a) => cloneAtividadePlano(a, ctx));
      planoFonte = 'aplicado';
    } else {
      const template = registrosPreventiva.filter((r) => norm(r.maquina) === norm(ctx.maquina));
      currentActivities = template.map((a) => cloneAtividadePlano(a, ctx));
      planoFonte = template.length > 0 ? 'template' : 'vazio';
    }

    renderPlanoActivitiesTable();
  };


  const renderDescricoesGerador = (arr) => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${desc.replace(/"/g, '&quot;')}</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `).join('');
  };
  document.getElementById('btnNovaDescricaoGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `);
  });

  const renderMateriaisGerador = (arr) => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${desc.replace(/"/g, '&quot;')}</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `).join('');
  };
  document.getElementById('btnNovoMaterialGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `);
  });

  window.abrirModalAtividadePlano = function (idx) {
    if (!contextoCompleto()) {
      toast('Selecione máquina, mês e linha antes de editar.', 'warning');
      return;
    }
    const a = currentActivities[idx];
    if (!a) return;

    editandoPlanoIdx = idx;
    const ctx = getPlanoContexto();
    $('#modalAtivTitulo').textContent = `Editar — ${a.identificador || 'Atividade'}`;
    $('#editAtivId').value = String(idx);
    $('#editAtivIdentificador').value = a.identificador || '';
    $('#editAtivMaquina').value = ctx.maquina;
    renderDescricoesGerador(a.atividades_descricoes && a.atividades_descricoes.length ? a.atividades_descricoes : descricaoLinhas(a));
    const matArray = Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : []);
    renderMateriaisGerador(matArray);
    $('#editAtivDuracao').value = a.duracao_horas ?? '';
    $('#editAtivHhMec').value = a.hh_mec ?? '';
    $('#editAtivHhEle').value = a.hh_eletrico ?? '';
    $('#editAtivCustos').value = a.previsao_custos ?? '';
    $('#editAtivPlanoPadrao').value = a.plano_padrao || 'S';
    $('#editAtivStatus').value = a.status_auditoria || '';
    $('#editAtivRespFabrica').value = a.resp_fabrica || '';
    $('#editAtivRespManut').value = a.resp_manutencao || '';
    modalAtiv?.classList.add('open');
  };

  const fecharModalAtividadePlano = () => {
    editandoPlanoIdx = null;
    modalAtiv?.classList.remove('open');
  };

  const salvarModalAtividadePlano = (e) => {
    e.preventDefault();
    if (editandoPlanoIdx == null || !currentActivities[editandoPlanoIdx]) return;

    const ctx = getPlanoContexto();
    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador')).map(el => el.value.trim()).filter(Boolean);
    const materiais = Array.from(document.querySelectorAll('.mat-input-gerador')).map(el => el.value.trim()).filter(Boolean);

    const atualizado = {
      ...currentActivities[editandoPlanoIdx],
      identificador: $('#editAtivIdentificador').value.trim(),
      maquina: ctx.maquina,
      mes: ctx.mes,
      linha: ctx.linha,
      material: materiais,
      duracao_horas: parseFloat($('#editAtivDuracao').value) || 0,
      hh_mec: parseFloat($('#editAtivHhMec').value) || 0,
      hh_eletrico: parseFloat($('#editAtivHhEle').value) || 0,
      previsao_custos: parseFloat($('#editAtivCustos').value) || 0,
      plano_padrao: $('#editAtivPlanoPadrao').value || 'S',
      status_auditoria: $('#editAtivStatus').value || '',
      resp_fabrica: $('#editAtivRespFabrica').value.trim(),
      resp_manutencao: $('#editAtivRespManut').value.trim(),
      descricao: descricoes[0] || '',
      atividades_descricoes: descricoes,
    };

    currentActivities[editandoPlanoIdx] = atualizado;
    if (window.editedPlanoItems && currentActivities[editandoPlanoIdx]) window.editedPlanoItems.add(currentActivities[editandoPlanoIdx].identificador);
    if (window.editedPlanoItemsFE) window.editedPlanoItemsFE.add(currentActivities[editandoPlanoIdx].id);
    fecharModalAtividadePlano();
    renderPlanoActivitiesTable();
    toast('Atividade atualizada no plano. Clique em "Aplicar" para gravar na preventiva.', 'success');
  };

  const loadPlanoMachines = () => {
    let maquinasPrev = [...new Set(registrosPreventiva.map((r) => r.maquina).filter(Boolean))].sort();
    if (maquinasPrev.length === 0) {
      maquinasPrev = [
        'ABASTECIMENTO', 'ACUMULADORES', 'FORNO', 'IMPRESSORA', 'LAVADORA',
        'PRENSA', 'QUEIMADORES', 'TORNO', 'VERNIZ INTERNO',
      ];
    }
    if (!machineSelect) return;
    machineSelect.innerHTML =
      '<option value="">Selecione a máquina...</option>' +
      maquinasPrev.map((m) => `<option value="${m}">${m}</option>`).join('');
  };
  loadPlanoMachines();

  [machineSelect, monthSelect, lineSelect].forEach((el) => {
    el?.addEventListener('change', carregarAtividadesPlano);
  window.carregarAtividadesPlano = carregarAtividadesPlano;
  });

  $('#btnFecharModalAtividade')?.addEventListener('click', fecharModalAtividadePlano);
  $('#btnCancelarModalAtividade')?.addEventListener('click', fecharModalAtividadePlano);
  $('#formEditarAtividade')?.addEventListener('submit', salvarModalAtividadePlano);
  modalAtiv?.addEventListener('click', (e) => {
    if (e.target === modalAtiv) fecharModalAtividadePlano();
  });

  btnAplicar?.addEventListener('click', async () => {
    const ctx = getPlanoContexto();

    if (!contextoCompleto()) {
      toast('Selecione máquina, mês e linha antes de aplicar.', 'warning');
      return;
    }
    if (currentActivities.length === 0) {
      toast('Nenhuma atividade no plano. Importe a planilha ou selecione outra máquina.', 'warning');
      return;
    }

    const confirm = await Swal.fire({
      title: 'Aplicar Plano à Preventiva',
      html: `<p>Serão <strong>substituídos</strong> apenas os registros de:</p>
        <ul style="text-align:left; margin:1rem 0; padding-left:1.25rem; line-height:1.6;">
          <li><strong>Máquina:</strong> ${ctx.maquina}</li>
          <li><strong>Mês:</strong> ${ctx.mes}</li>
          <li><strong>Linha:</strong> ${ctx.linha}</li>
        </ul>
        <p style="font-size:0.9rem; color:#94a3b8;">Outras máquinas, meses e linhas <strong>não serão alterados</strong>.</p>
        <p><strong>${currentActivities.length}</strong> atividade(s) serão gravadas.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sim, aplicar neste contexto',
      cancelButtonText: 'Cancelar',
      background: '#161f33',
      color: '#e2e8f0',
    });
    if (!confirm.isConfirmed) return;

    try {
      btnAplicar.disabled = true;
      btnAplicar.textContent = 'Aplicando...';

      const client = getClient();
      const { error: delErr } = await client
        .from('preventiva_registros')
        .delete()
        .eq('maquina', ctx.maquina)
        .eq('mes', ctx.mes)
        .eq('linha', ctx.linha);
      if (delErr) throw delErr;

      const records = currentActivities.map((a) => ({
        identificador: a.identificador || '',
        maquina: ctx.maquina,
        material: Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : []),
        plano_padrao: a.plano_padrao || 'S',
        mes: ctx.mes,
        linha: ctx.linha,
        duracao_horas: a.duracao_horas || 0,
        hh_mec: a.hh_mec || 0,
        hh_eletrico: a.hh_eletrico || 0,
        resp_fabrica: a.resp_fabrica || '',
        resp_manutencao: a.resp_manutencao || '',
        status_auditoria: a.status_auditoria || '',
        previsao_custos: a.previsao_custos || 0,
        atividades_descricoes: a.atividades_descricoes || descricaoLinhas(a),
        programacao: a.programacao || {},
      }));

      const { error: insErr } = await client.from('preventiva_registros').insert(records);
      if (insErr) throw insErr;

      toast(`✅ ${records.length} atividades aplicadas em ${ctx.mes} · ${ctx.linha} · ${ctx.maquina}`, 'success');
      try {
        registrosPreventiva = await carregarPreventiva();
      } catch (_e) { /* noop */ }
      planoFonte = 'aplicado';
      carregarAtividadesPlano();
    } catch (err) {
      toast('Erro ao aplicar plano: ' + err.message, 'error');
    } finally {
      btnAplicar.disabled = !contextoCompleto() || currentActivities.length === 0;
      btnAplicar.textContent = '✔️ Aplicar Plano à Preventiva';
      if (window.editedPlanoItems) window.editedPlanoItems.clear();
      renderPlanoActivitiesTable();
    }
  });

  renderPlanoActivitiesTable();

  window._refreshPlanoPreventiva = () => {
    loadPlanoMachines();
    carregarAtividadesPlano();
  };
}

function atualizarBarraLinha() {
  const bar = $('#rowActionBar');
  const label = $('#rowActionLabel');
  if (!bar) return;

  if (!linhaSelecionadaId) {
    bar.classList.add('hidden');
    return;
  }

  const r = registros.find((x) => String(x.id) === String(linhaSelecionadaId));
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
    tr.classList.toggle('row-selected', String(tr.dataset.id) === String(id));
  });
  atualizarBarraLinha();
}

const COLUNAS_EDITAVEIS = ['fornecedor', 'data_saida', 'orcamento', 'rc', 'po', 'data_recebimento', 'nf'];

function renderTabela() {
  const data = getFiltrados();
  const thead = $('#tabelaHead');
  const tbody = $('#tabelaBody');
  const count = $('#tableCount');

  if (linhaSelecionadaId && !data.some((r) => String(r.id) === String(linhaSelecionadaId))) {
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
      const isSyncing = false;
      const atrasado =
        (r.status || calcularStatus(r)) !== 'ENTREGUE' &&
        r.previsao_entrega &&
        new Date(r.previsao_entrega) < new Date();
      const sel = String(r.id) === String(linhaSelecionadaId) ? ' row-selected' : '';
      const syncingClass = isSyncing ? ' row-syncing' : '';
      return `
    <tr data-id="${r.id}" class="${atrasado ? 'row-late' : ''}${sel}${syncingClass}">
      ${COLUNAS_TABELA.map((c) => {
        const rawVal = r[c.key] ?? '';
        let cellHtml = valorCelula(r, c);
        
        // Inject sync icon next to status
        if (c.key === 'status' && isSyncing) {
          cellHtml += ' <i class="fas fa-sync sync-icon" title="Sincronizando com o servidor..."></i>';
        }
        
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
        const registro = data.find((x) => String(x.id) === String(id));
        if (!registro) return;

        const input = document.createElement('input');
        input.type = col.startsWith('data_') ? 'date' : 'text';
        if (col === 'data_recebimento') input.max = new Date().toISOString().slice(0, 10);
        input.value = rawVal;
        input.className = 'inline-edit-input';

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();

        const salvarInline = async () => {
          const newVal = input.value.trim();
          if (newVal === rawVal) {
            refresh();
            return;
          }
          
          try {
            const updated = enriquecerRegistro({ ...registro, [col]: newVal || null });
            const salvo = await salvarRegistro(updated);
            
            const index = registros.findIndex((x) => String(x.id) === String(id));
            if (index !== -1) registros[index] = salvo;
            else registros.push(salvo);
            
            toast('Alteração salva.', 'success');
          } catch (err) {
            toast('Falha ao salvar: ' + err.message, 'error');
          } finally {
            refresh();
          }
        };

        input.addEventListener('blur', salvarInline);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            input.blur();
          }
          if (evt.key === 'Escape') {
            input.removeEventListener('blur', salvarInline);
            refresh();
          }
        });
      });
    });
  }

  atualizarBarraLinha();
}

function abrirDetalhe(id) {
  const r = registros.find((x) => String(x.id) === String(id));
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
  } else if (['consertos', 'compras', 'fabricacao'].includes(viewAtual)) {
    const titulo = viewAtual === 'consertos' ? 'CONSERTOS - PREVISTOS X RECEBIDOS' : (viewAtual === 'compras' ? 'COMPRAS - PREVISTOS X RECEBIDOS' : 'FABRICAÇÃO - PREVISTOS X RECEBIDOS');
    requestAnimationFrame(() => renderCrudMesChart(getFiltrados(), titulo));
  } else {
    destroyCrudMesChart();
  }
  renderAlertas();
}

function renderAlertas() {
  const el = $('#alertasLista');
  if (!el) return;
  
  const atrasadosRaw = registrosAtrasados(getFiltrados());
  // Sort by delay (oldest first)
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  
  const atrasados = atrasadosRaw.map(r => {
    let dias = 0;
    if (r.previsao_entrega) {
      const prev = new Date(r.previsao_entrega + 'T12:00:00');
      dias = Math.floor((hoje - prev) / (1000 * 60 * 60 * 24));
    }
    return { ...r, _diasAtraso: dias > 0 ? dias : 0 };
  }).sort((a, b) => b._diasAtraso - a._diasAtraso).slice(0, 8);

  if (!atrasados.length) {
    el.innerHTML = '<p class="muted" style="padding: 1rem; font-size: 0.9rem;">Nenhum item atrasado no filtro atual.</p>';
    return;
  }
  
  const totalAtrasado = atrasadosRaw.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  let html = `
    <div style="margin-bottom: 1.5rem;">
      <div style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 0.25rem;">Capital Retido em Atraso</div>
      <div style="font-size: 1.85rem; color: var(--danger, #ef4444); font-weight: 700; font-family: 'DM Sans', sans-serif; letter-spacing: -0.02em;">${formatter.format(totalAtrasado)}</div>
      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Total de ${atrasadosRaw.length} ordens impactadas</div>
    </div>
    <div class="executive-late-list" style="display: flex; flex-direction: column; gap: 0.25rem;">
  `;

  html += atrasados.map(r => {
    const val = Number(r.valor) || 0;
    const isCritico = r.criticidade === 'ALTA' || r._diasAtraso > 30;
    const dotColor = isCritico ? '#ef4444' : (r._diasAtraso > 15 ? '#f59e0b' : '#3b82f6');
    const bgHover = 'rgba(255,255,255,0.02)';
    
    return `
      <div class="late-row" data-id="${r.id}" style="display: flex; align-items: flex-start; justify-content: space-between; padding: 0.85rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: background 0.2s; border-radius: 4px;" onmouseover="this.style.background='${bgHover}'" onmouseout="this.style.background='transparent'">
        <div style="display: flex; gap: 0.75rem; align-items: flex-start; flex: 1; min-width: 0;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; margin-top: 0.45rem; flex-shrink: 0; box-shadow: 0 0 8px ${dotColor}40;"></div>
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; letter-spacing: 0.01em;">${r.item || '—'}</span>
            <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.2rem; font-size: 0.75rem; color: var(--text-secondary);">
              <span style="color: ${dotColor}; font-weight: 500;">+${r._diasAtraso} dias</span>
              <span style="opacity: 0.5;">|</span>
              <span>${r.maquina_linha || 'Geral'}</span>
            </div>
          </div>
        </div>
        <div style="text-align: right; padding-left: 1rem; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); font-family: 'DM Sans', sans-serif;">${val > 0 ? formatter.format(val) : '-'}</span>
          <span style="font-size: 0.7rem; color: var(--muted); margin-top: 0.2rem; text-transform: uppercase;">${r.natureza || 'PO'}</span>
        </div>
      </div>
    `;
  }).join('');

  if (atrasadosRaw.length > 8) {
    html += `
      <div style="text-align: center; margin-top: 1rem;">
        <button type="button" style="background: none; border: none; color: var(--muted); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--muted)'" onclick="abrirPainelAtrasados()">+ Ver todos os ${atrasadosRaw.length} itens</button>
      </div>
    `;
  }

  html += `</div>`;
  el.innerHTML = html;
  
  el.querySelectorAll('.late-row').forEach((b) =>
    b.addEventListener('click', () => abrirDetalhe(b.dataset.id))
  );
}

function showView(name) {
  if (name === 'form-preventiva') {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $('#view-form-preventiva')?.classList.add('active');
    return;
  }

  viewAtual = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('nav.tabs button, .nav-item, .nav-accordion-trigger').forEach((b) => b.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  document.querySelectorAll(`[data-tab="${name}"]`).forEach((el) => {
    el.classList.add('active');
    const subMenu = el.closest('.nav-sub-menu');
    if (subMenu) {
      const trigger = subMenu.previousElementSibling;
      if (trigger && trigger.classList.contains('nav-accordion-trigger')) {
        trigger.classList.add('active');
        trigger.classList.add('accordion-open');
        subMenu.classList.add('accordion-open');
      }
    }
  });

  const crud = ['rc', 'consertos', 'compras', 'fabricacao'].includes(name);
  const isDash = name === 'dashboard';
  const isSpecial = ['fornecedores', 'calendario', 'planos-manutencao', 'por-maquina', 'plano-preventiva',
                     'planos-manutencao-frontend', 'plano-preventiva-frontend', 'plano-mestre', 'indicadores',
                     'movimentacoes-dashboard', 'movimentacoes-grid'].includes(name);

  const isTask = ['gestao-tarefas', 'minhas-tarefas'].includes(name);

  // Seção tabela (toolbar + tabela de RCs) - Hide for preventiva since it has its own
  $('#secaoTabela')?.classList.toggle('hidden', !['rc', 'consertos', 'compras', 'fabricacao'].includes(name));
  $('#secaoCrudGraficos')?.classList.toggle('hidden', !['consertos', 'compras', 'fabricacao'].includes(name));

  // Botão Fluxo de Consertos só aparece na aba Consertos
  const btnFluxo = $('#btnFluxoConsertos');
  if (btnFluxo) btnFluxo.style.display = name === 'consertos' ? '' : 'none';

  // KPIs e filtros — ocultos nas views especiais (ambos estão dentro do painel-fixo)
  $('#painel-fixo')?.classList.toggle('hidden', isSpecial);
  
  // Ocultar os filtros globais (debaixo dos KPIs) especificamente nas abas de tarefas
  $('#global-filters')?.classList.toggle('hidden', isTask);


  // Dashboard e alertas
  $('#secaoDashboard')?.classList.toggle('hidden', !isDash);
  $('#secaoAlertas')?.classList.toggle('hidden', !isDash);

  document.body.classList.toggle('view-crud', crud);

  if (name === 'fornecedores') {
    renderFornecedoresSLA();
  } else if (name === 'calendario') {
    updateCalendario(registros);
  } else if (name === 'por-maquina') {
    renderMachineList();
  } else if (name === 'plano-preventiva') {
    window._refreshPlanoPreventiva?.();
  } else if (name === 'planos-manutencao-frontend') {
    if (!estadoPlanosFrontend.mes) planosGoToStepFrontend('mes');
  } else if (name === 'plano-preventiva-frontend') {
    window._refreshPlanoPreventivaFrontend?.();
  }

  const titles = {
    dashboard: 'Visão Geral',
    rc: 'Controle Global',
    consertos: 'Consertos',
    compras: 'Compras',
    fabricacao: 'Fabricação',
    fornecedores: 'SLA Fornecedores',
    calendario: 'Calendário',
    'planos-manutencao': 'Planos de Manutenção — Back-end',
    'planos-manutencao-frontend': 'Planos de Manutenção — Front-end',
    'por-maquina': 'Máquinas & Templates',
    'plano-preventiva': 'Gerador de Planos — Back-end',
    'plano-preventiva-frontend': 'Gerador de Planos — Front-end',
    'movimentacoes-dashboard': 'Custo Geral',
    'movimentacoes-grid': 'Movimentações',
  };
  const topbarTitle = $('#topbarTitle');
  if (topbarTitle && titles[name]) topbarTitle.textContent = titles[name];

  const t = $('#crudTitle');
  if (t && titles[name]) t.textContent = titles[name];

  refresh();

  // Force ECharts to resize after the view is displayed
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

// =====================================================
// MODAL: FLUXO DE CONSERTOS
// =====================================================
function abrirModalFluxoConsertos() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth(); // 0-11
  const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Remove modal anterior se existir
  const old = document.getElementById('modalFluxoConsertos');
  if (old) old.remove();

  const opcoesRetroativas = MESES_NOMES.slice(0, mesAtual + 1).map((m, i) =>
    `<option value="${i}" ${i === mesAtual ? 'selected' : ''}>${m} ${anoAtual}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'modalFluxoConsertos';
  modal.style.cssText = `
    position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-card,#1e293b); border:1px solid var(--border,#334155); border-radius:16px;
                padding:1.5rem; width:min(90vw,820px); max-height:85vh; overflow-y:auto; position:relative;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
        <h2 style="margin:0; font-size:1.1rem; color:var(--text,#f1f5f9);">📊 Fluxo de Consertos</h2>
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <select id="fluxoMesSel" style="background:var(--bg-alt,#0f172a); color:var(--text,#f1f5f9);
            border:1px solid var(--border,#334155); border-radius:8px; padding:6px 10px; font-size:0.85rem; cursor:pointer;">
            <option value="all">Ano completo (${anoAtual})</option>
            ${opcoesRetroativas}
          </select>
          <button id="fluxoFechar" style="background:transparent; border:1px solid var(--border,#334155); color:var(--muted,#94a3b8);
            border-radius:8px; padding:6px 12px; cursor:pointer; font-size:0.85rem;">✕ Fechar</button>
        </div>
      </div>
      <div style="position:relative; height:340px; width:100%;">
        <div id="chartFluxoConsertos" style="width: 100%; height: 100%;"></div>
      </div>
      <p id="fluxoHint" style="margin-top:0.75rem; font-size:0.75rem; color:var(--muted,#94a3b8); text-align:center;">
        💡 Clique nas barras para ver os registros detalhados · Barras amarelas = patrimônio exposto · Barras verdes = custo de reparo realizado
      </p>
    </div>
  `;
  document.body.appendChild(modal);

  const consertos = registros.filter(r => (r.natureza || '').toUpperCase().includes('CONSERTO'));

  const renderFluxo = () => {
    const sel = document.getElementById('fluxoMesSel');
    const val = sel?.value;
    const mesAlvo = val === 'all' ? null : parseInt(val, 10);
    renderConsertoFluxoChart('chartFluxoConsertos', consertos, anoAtual, mesAlvo);
  };

  document.getElementById('fluxoMesSel')?.addEventListener('change', renderFluxo);
  document.getElementById('fluxoFechar')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  setTimeout(renderFluxo, 100); // Aguarda a modal renderizar fisicamente para o ECharts ler o Width correto
}

function abrirModal(id) {
  const naturezaPadrao = {
    consertos: 'CONSERTO',
    compras: 'COMPRA',
    fabricacao: 'FABRICACAO',
    rc: 'CONSERTO',
  };
  editando = id
    ? registros.find((r) => String(r.id) === String(id))
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
    'valor', 'valoracao', 'previsao_entrega', 'data_recebimento', 'comentario',
  ];
  fields.forEach((name) => {
    const input = f.querySelector(`[name="${name}"]`);
    if (input) input.value = editando[name] ?? '';
  });

  const inputRecebimento = f.querySelector('[name="data_recebimento"]');
  if (inputRecebimento) inputRecebimento.max = new Date().toISOString().slice(0, 10);

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
  
  // Mídia (Foto)
  fotoUrlAtual = editando.foto_url || null;
  const fotoPreview = $('#fotoPreview');
  const fotoPlaceholder = $('#fotoPlaceholder');
  const btnRemoverFoto = $('#btnRemoverFoto');
  if (fotoUrlAtual) {
    fotoPreview.src = fotoUrlAtual;
    fotoPreview.style.display = 'block';
    if (fotoPlaceholder) fotoPlaceholder.style.display = 'none';
    if (btnRemoverFoto) btnRemoverFoto.style.display = 'inline-block';
  } else {
    fotoPreview.src = '';
    fotoPreview.style.display = 'none';
    if (fotoPlaceholder) fotoPlaceholder.style.display = 'block';
    if (btnRemoverFoto) btnRemoverFoto.style.display = 'none';
  }

  // Mídia (PDF)
  pdfUrlAtual = editando.pdf_url || null;
  const pdfPlaceholder = $('#pdfPlaceholder');
  const btnRemoverPdf = $('#btnRemoverPdf');
  if (pdfUrlAtual) {
    if (pdfPlaceholder) pdfPlaceholder.textContent = 'PDF Anexado';
    if (btnRemoverPdf) btnRemoverPdf.style.display = 'inline-block';
  } else {
    if (pdfPlaceholder) pdfPlaceholder.textContent = 'Nenhum PDF selecionado';
    if (btnRemoverPdf) btnRemoverPdf.style.display = 'none';
  }

  const btnSalvar = $('#formRegistro').querySelector('button[type="submit"]');
  if (btnSalvar) {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar';
  }
  
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
    item: f.querySelector('[name="item"]').value,
    descricao_falha: f.descricao_falha.value,
    solicitante: f.solicitante.value,
    criticidade: f.criticidade.value || null,
    linha: f.linha.value,
    maquina: f.maquina.value,
    fornecedor: f.fornecedor.value,
    nf_saida: f.nf_saida.value,
    data_saida: f.data_saida.value || null,
    orcamento: f.orcamento.value,
    rc: f.rc.value ? f.rc.value.replace(/\./g, '') : '',
    po: f.po.value,
    valor: parseFloat(f.valor.value) || 0,
    valoracao: f.querySelector('[name="valoracao"]') ? (parseFloat(f.querySelector('[name="valoracao"]').value) || null) : null,
    previsao_entrega: f.previsao_entrega.value || null,
    data_recebimento: f.data_recebimento.value || null,
    comentario: f.comentario.value,
    foto_url: fotoUrlAtual,
    pdf_url: pdfUrlAtual,
  };
  const btnSalvar = $('#formRegistro').querySelector('button[type="submit"]');
  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
  }

  try {
    const salvo = await salvarRegistro(payload);
    
    // Atualizar registro no array local
    if (editando && editando.id) {
      const idx = registros.findIndex(r => String(r.id) === String(editando.id));
      if (idx !== -1) registros[idx] = salvo;
    } else {
      registros.push(salvo);
    }
    
    $('#modal').classList.remove('open');
    toast('Registro salvo com sucesso!', 'success');
    renderFiltros();
    refresh();
  } catch (err) {
    console.error("Erro no salvamento:", err);
    toast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar';
    }
  }
}

async function excluir(id) {
  if (!confirmar('Excluir este registro permanentemente?')) return;
  try {
    await excluirRegistro(id);
    registros = registros.filter(r => String(r.id) !== String(id));
    toast('Registro excluído.', 'success');
    refresh();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function duplicar(id) {
  try {
    const salvo = await duplicarRegistro(id);
    registros.push(salvo);
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
    btn.style.background = '#ef4444';
      btn.style.color = '#ffffff';
      btn.style.fontWeight = '700';
      btn.style.borderColor = '#ef4444';
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
    // Dispara initIndicadores imediatamente para que os gráficos carreguem em paralelo com o banco
    initIndicadores();
    initConfiabilidade();

    // Paraleliza todas as chamadas de banco de dados do sistema (ganho de tempo = soma dos tempos virando apenas o tempo da mais lenta)
    const [
      fornecedores,
      regs,
      preventivas,
      tarefas
    ] = await Promise.allSettled([
      getFornecedoresContatos(),
      carregarRegistros(),
      carregarPreventiva(),
      getTarefasDelegadas()
    ]);

    if (fornecedores.status === 'fulfilled') {
      window.fornecedoresContatosData = fornecedores.value;
      preencherDatalistFornecedoresContatos();
    }

    if (regs.status === 'fulfilled') registros = regs.value;

    if (preventivas.status === 'fulfilled') {
      const todosPreventiva = preventivas.value;
      registrosPreventiva = todosPreventiva.filter(r => r.setor !== 'frontend');
      registrosPreventivaFrontend = todosPreventiva.filter(r => r.setor === 'frontend');
    }

    // Expor TUDO para o Copiloto poder buscar ordens de todos os módulos
    window._registrosGlobais = [...registros];

    if (tarefas.status === 'fulfilled') {
      tarefasDelegadas = tarefas.value;
      renderGestaoTarefas();
      renderMinhasTarefas();
      
      // ==========================================================================
      // ESCUTA ATIVA (REAL-TIME) - ARQUITETURA DISTRIBUÍDA
      // ==========================================================================
      // Responsabilidade: Reagir aos eventos empurrados pelo backend local via SSE
      // (Server-Sent Events) quando QUALQUER modificação for feita no banco
      // de dados (seja por você ou por outro usuário em outro PC).
      //
      // Quando acionado, ele silenciosamente baixa apenas as tabelas novamente
      // (registros, preventivas, custos, tarefas) e atualiza a tela para garantir
      // que todos os usuários tenham sempre a versão mais recente dos dados,
      // incluindo notificações de "Nova Tarefa" se aplicável.
      // ==========================================================================
      initRealtimeSync(async () => {
        // Quando receber evento de atualização, recarrega os dados silenciosamente
        try {
          registros = await carregarRegistros();
          try {
            const todosPreventiva = await carregarPreventiva();
            registrosPreventiva = todosPreventiva.filter(r => r.setor !== 'frontend');
            registrosPreventivaFrontend = todosPreventiva.filter(r => r.setor === 'frontend');
          } catch(e){}
          window._registrosGlobais = [...registros];
          
          const novas = await getTarefasDelegadas();
          const oldIds = new Set(tarefasDelegadas.map(t => t.id));
          tarefasDelegadas = novas;
          
          const novasMim = tarefasDelegadas.filter(t => !oldIds.has(t.id) && t.atribuido_para === window.currentUser?.username);
          if (novasMim.length > 0) {
            const nova = novasMim[0];
            document.getElementById('ntrTitulo').textContent = nova.titulo;
            document.getElementById('ntrDe').innerHTML = `DELEGADO POR: <span style="color: var(--text); font-weight: bold;">${nova.atribuido_por}</span>`;
            document.getElementById('ntrDescricao').textContent = nova.descricao || 'Sem descrição detalhada.';
            document.getElementById('modalNovaTarefaRecebida')?.classList.add('open');
            toast(`Nova tarefa atribuída por ${nova.atribuido_por}!`, 'info');
          }
          
          refresh();
          renderGestaoTarefas();
          renderMinhasTarefas();
          
          // Se a tela de KPIs estiver ativa, atualiza ela também
          const v = document.getElementById('view-indicadores');
          if (v && v.style.display !== 'none' && window.carregarEAtualizarPainel) {
             window.carregarEAtualizarPainel();
          }
        } catch (err) {
          console.error("Erro na sincronização automática:", err);
        }
      });
      
      // Start interval for timers
      if (!intervalTarefas) {
        intervalTarefas = setInterval(() => {
          renderGestaoTarefas(true);
          renderMinhasTarefas(true);
        }, 1000);
      }
      }
  } catch (e) {
    $('#appStatus').textContent = 'Erro: ' + e.message;
    return;
  }

  $('#appStatus').innerHTML = `<span class="dot-online"></span> ${registros.length} registros`;

  STATUS_LIST.forEach((s) => {
    $('#filtroStatus').innerHTML += `<option value="${s}">${s}</option>`;
  });
  CRITICIDADE_LIST.forEach((c) => {
    $('#filtroCriticidade').innerHTML += `<option value="${c}">${c}</option>`;
  });

  renderFiltros();
  setDrilldownEditHandler((id) => abrirModal(id));
  setDrilldownViewHandler((id) => {
    const r = registros.find((x) => String(x.id) === String(id));
    if (!r) return;
    
    // Switch to the correct view based on Natureza
    const navMap = {
      'CONSERTO': 'consertos',
      'COMPRA': 'compras',
      'FABRICACAO': 'fabricacao'
    };
    const targetView = navMap[r.natureza] || 'rc';
    
    // Clear filters and set search string
    filtros = { natureza: 'TODOS', status: 'TODOS', criticidade: 'TODOS', linha: 'TODOS', maquina: 'TODOS', fornecedor: 'TODOS', busca: '' };
    document.querySelectorAll('.filters select').forEach((el) => {
      el.value = 'TODOS';
    });
    
    const searchInput = $('#filtroBusca');
    if (searchInput) {
      searchInput.value = r.rc ? String(r.rc) : (r.item || '');
      filtros.busca = searchInput.value;
    }
    
    showView(targetView);
    selecionarLinha(id);
    
    setTimeout(() => {
      const tr = document.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
  setDrilldownPhotoHandler(async (id, dataUrl, tipoMedia = 'foto') => {
    const r = registros.find((x) => String(x.id) === String(id));
    if (!r) return;
    try {
      const payload = { ...r };
      if (tipoMedia === 'pdf') {
        payload.pdf_url = dataUrl;
      } else {
        payload.foto_url = dataUrl;
      }
      const salvo = await salvarRegistro(payload);
      const idx = registros.findIndex(x => String(x.id) === String(salvo.id));
      if (idx !== -1) registros[idx] = salvo;
      toast(`Mídia da RC atualizada (${tipoMedia.toUpperCase()}).`, 'success');
      refresh();
    } catch (err) {
      toast(`Erro ao atualizar ${tipoMedia}: ` + err.message, 'error');
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
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'controle-preventiva') {
        const container = btn.nextElementSibling;
        const arrow = btn.querySelector('.sub-tab-arrow');
        if (container && container.classList.contains('sub-tabs-container')) {
          const isClosed = container.style.display === 'none';
          container.style.display = isClosed ? 'flex' : 'none';
          if (arrow) arrow.style.transform = isClosed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
      showView(btn.dataset.tab);
    });
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

  const COLUNAS_PREVENTIVA = [
    { key: 'identificador', label: 'Identificador', width: 15 },
    { key: 'maquina', label: 'Máquina', width: 25 },
    { key: 'linha', label: 'Linha', width: 10 },
    { key: 'mes', label: 'Mês', width: 15 },
    { key: 'atividades_descricoes', label: 'Descrição/Atividade', width: 50 },
    { key: 'material', label: 'Materiais Necessários', width: 40 },
    { key: 'duracao_horas', label: 'Duração (h)', width: 12 },
    { key: 'hh_mec', label: 'HH Mec', width: 10 },
    { key: 'hh_eletrico', label: 'HH Elétrico', width: 10 },
    { key: 'previsao_custos', label: 'Custo Previsto', width: 15 },
    { key: 'status_auditoria', label: 'Status/Auditoria', width: 15 }
  ];

  $('#btnNovo').addEventListener('click', () => abrirModal(null));
  $('#btnExport').addEventListener('click', () => exportarExcel(getFiltrados(), viewAtual));
  $('#btnExportPreventiva')?.addEventListener('click', () => {
    const data = aplicarFiltrosPreventiva().map(r => ({
      ...r,
      atividades_descricoes: Array.isArray(r.atividades_descricoes) ? r.atividades_descricoes.join('\n') : (r.descricao || ''),
      material: Array.isArray(r.material) ? r.material.filter(Boolean).join('\n') : (r.material || '')
    }));
    exportarExcel(data, 'preventiva-backend', COLUNAS_PREVENTIVA);
  });
  $('#btnExportPreventivaFE')?.addEventListener('click', () => {
    const data = aplicarFiltrosFrontend().map(r => ({
      ...r,
      atividades_descricoes: Array.isArray(r.atividades_descricoes) ? r.atividades_descricoes.join('\n') : (r.descricao || ''),
      material: Array.isArray(r.material) ? r.material.filter(Boolean).join('\n') : (r.material || '')
    }));
    exportarExcel(data, 'preventiva-frontend', COLUNAS_PREVENTIVA);
  });


  
  function mergeLinhaData(baseArray, linha, mes) {
    const map = new Map();
    for (const r of baseArray) {
      const key = `${r.maquina}_${r.identificador}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    
    const finalResults = [];
    const outrasLinhas = ['L04', 'L05', 'L06', 'L07', 'L08', 'L09'].filter(l => l !== linha);

    for (const records of map.values()) {
      let selected = records.find(r => r.mes === mes && r.linha === linha);
      let padrao = records.find(r => !r.mes || r.mes === '' || String(r.mes).toUpperCase() === 'TODOS' || String(r.mes) === 'null' || String(r.linha).toUpperCase() === 'PADRAO');
      
      if (!selected) {
        selected = padrao;
      } else if (padrao) {
        // Se existe o selecionado (agendamento específico) mas tem campos em branco, herda do PADRÃO
        const clone = { ...selected };
        if (!clone.material || (Array.isArray(clone.material) && clone.material.length === 0) || (typeof clone.material === 'string' && clone.material.trim() === '')) {
          clone.material = padrao.material;
        }
        if (!clone.atividades_descricoes || (Array.isArray(clone.atividades_descricoes) && clone.atividades_descricoes.length === 0)) {
          clone.atividades_descricoes = padrao.atividades_descricoes;
        }
        if (!clone.descricao && padrao.descricao) clone.descricao = padrao.descricao;
        if (!clone.duracao_horas && padrao.duracao_horas) clone.duracao_horas = padrao.duracao_horas;
        if (!clone.hh_mec && padrao.hh_mec) clone.hh_mec = padrao.hh_mec;
        if (!clone.hh_eletrico && padrao.hh_eletrico) clone.hh_eletrico = padrao.hh_eletrico;
        selected = clone;
      }
      
      if (!selected && records.length > 0) {
        selected = records.find(r => r.linha === 'L06') || records[0];
      }
      
      if (selected) {
        const maq = String(selected.maquina || '').toUpperCase();
        let isDeOutraLinha = false;
        for (const out of outrasLinhas) {
          if (maq.includes(out)) {
            isDeOutraLinha = true;
            break;
          }
        }
        if (!isDeOutraLinha) {
          finalResults.push(selected);
        }
      }
    }
    return finalResults;
  }

  function getLinhaDataParaExportacao() {
    let data = [];
    let prefix = '';
    
    if (estadoPlanos.setor === 'backend') {
      data = mergeLinhaData(registrosPreventiva, estadoPlanos.linha, estadoPlanos.mes);
      prefix = 'linha-backend';
    } else {
      data = mergeLinhaData(registrosPreventivaFrontend, estadoPlanos.linha, estadoPlanos.mes);
      prefix = 'linha-frontend';
    }

    data.sort((a, b) => {
      const idA = String(a.identificador || '');
      const idB = String(b.identificador || '');
      return idA.localeCompare(idB, undefined, {numeric: true});
    });

    return { data, prefix };
  }

  const handleExportExcelLinha = () => {
    const { data, prefix } = getLinhaDataParaExportacao();
    const formattedData = data.map(r => ({
      ...r,
      atividades_descricoes: Array.isArray(r.atividades_descricoes) ? r.atividades_descricoes.join('\n') : (r.descricao || ''),
      material: Array.isArray(r.material) ? r.material.filter(Boolean).join('\n') : (r.material || '')
    }));

    const filename = `${prefix}-${estadoPlanos.linha}-${estadoPlanos.mes}`;
    exportarExcel(formattedData, filename, COLUNAS_PREVENTIVA);
  };

  const handleExportPDFLinha = () => {
    const { data } = getLinhaDataParaExportacao();
    gerarChecklistLinhaPDF(estadoPlanos.linha, estadoPlanos.mes, data);
  };

  $('#btnExportarLinhaExcel')?.addEventListener('click', handleExportExcelLinha);
  $('#btnExportarLinhaExcelFE')?.addEventListener('click', handleExportExcelLinha);
  $('#btnExportarLinhaPDF')?.addEventListener('click', handleExportPDFLinha);
  $('#btnExportarLinhaPDFFE')?.addEventListener('click', handleExportPDFLinha);

  $('#btnExportarRetomadaPDF')?.addEventListener('click', () => {
  if (typeof window.getDadosFiltradosRL05 !== 'function') {
    alert('O módulo Retomada L05 não está pronto. Abra a seção e tente novamente.');
    return;
  }
  const dados = window.getDadosFiltradosRL05();
  gerarChecklistRetomadaPDF(dados);
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
  
  // Handlers para Foto e PDF na modal de criação
  $('#inputFoto')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 2 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 800;
        if (width > height) {
          if (width > max_size) { height *= max_size / width; width = max_size; }
        } else {
          if (height > max_size) { width *= max_size / height; height = max_size; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        fotoUrlAtual = canvas.toDataURL('image/webp', 0.6);
        $('#fotoPreview').src = fotoUrlAtual;
        $('#fotoPreview').style.display = 'block';
        $('#fotoPlaceholder').style.display = 'none';
        $('#btnRemoverFoto').style.display = 'inline-block';
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $('#btnRemoverFoto')?.addEventListener('click', () => {
    fotoUrlAtual = null;
    $('#fotoPreview').src = '';
    $('#fotoPreview').style.display = 'none';
    $('#fotoPlaceholder').style.display = 'block';
    $('#btnRemoverFoto').style.display = 'none';
    $('#inputFoto').value = '';
  });

  $('#inputPdf')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Por favor, selecione apenas arquivos PDF.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('PDF muito grande. Máximo 5 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pdfUrlAtual = reader.result;
      $('#pdfPlaceholder').textContent = 'PDF Anexado';
      $('#btnRemoverPdf').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
  $('#btnRemoverPdf')?.addEventListener('click', () => {
    pdfUrlAtual = null;
    $('#pdfPlaceholder').textContent = 'Nenhum PDF selecionado';
    $('#btnRemoverPdf').style.display = 'none';
    $('#inputPdf').value = '';
  });

  $('#drillFechar').addEventListener('click', fecharDrilldown);
  $('#drillOverlay').addEventListener('click', fecharDrilldown);

  // ===== PDF Report Buttons =====
  $('#btnExportDashboardPdf')?.addEventListener('click', () => {
    gerarRelatorioExecutivoPDF(registros);
  });
  $('#btnExportSlaPdf')?.addEventListener('click', () => {
    gerarRelatorioSLAPDF(registros);
  });

  // ===== Botão Fluxo Consertos =====
  $('#btnFluxoConsertos')?.addEventListener('click', abrirModalFluxoConsertos);

  setupPlanoPreventivaUI();
  setupPlanoPreventivaUIFrontend();

  // Accordion handlers para sub-menus da sidebar
  document.querySelectorAll('.nav-accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuId = trigger.dataset.accordion + '-sub';
      const menu = document.getElementById(menuId);
      trigger.classList.toggle('accordion-open');
      menu?.classList.toggle('accordion-open');
    });
  });

  atualizarBotaoEdicao();
  showView('dashboard');
}

// ========== Login / Auth handlers ==========
document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    await signIn(email, senha);
  } catch (err) {
    toast('Credenciais inválidas: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Entrar na Conta';
  }
});

document.getElementById('formCadastro')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('cadNome')?.value.trim();
  const email = document.getElementById('cadEmail')?.value.trim();
  const senha = document.getElementById('cadSenha')?.value;
  try {
    await signUp(email, senha, nome);
    toast('Conta criada com sucesso! Faça login para acessar.', 'success');
    document.getElementById('cadEmail').value = '';
    document.getElementById('cadSenha').value = '';
    if (document.getElementById('cadNome')) document.getElementById('cadNome').value = '';
    document.getElementById('loginEmail').value = email;
    const fCad = document.getElementById('formCadastro');
    const fLog = document.getElementById('formLogin');
    if (fCad.style.display !== 'none') {
      fCad.style.display = 'none';
      fLog.style.display = 'flex';
    }
  } catch (err) {
    toast('Erro no cadastro: ' + err.message, 'error');
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
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const atrasadosForn = apenasDesteForn.reduce((acc, r) => {
          if (r.data_recebimento && r.previsao_entrega) {
            const dataRec = new Date(r.data_recebimento);
            const dataPrev = new Date(r.previsao_entrega);
            const diffTime = dataRec - dataPrev;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) acc.push({ ...r, _diasAtraso: diffDays });
          } else {
            const st = r.status || calcularStatus(r);
            if (st !== 'ENTREGUE' && r.previsao_entrega) {
              const dataPrev = new Date(r.previsao_entrega);
              if (dataPrev < hoje) {
                const diffTime = hoje - dataPrev;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                acc.push({ ...r, _diasAtraso: diffDays });
              }
            }
          }
          return acc;
        }, []);
        
        if (atrasadosForn.length === 0) {
           toast('Este fornecedor não possui itens em atraso.', 'info');
           return;
        }

        const total = atrasadosForn.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        abrirDrilldown({
          titulo: `Atrasados/Gargalos: ${forn}`,
          subtitulo: `${atrasadosForn.length} registro(s) entregues com atraso ou vencidos`,
          registros: atrasadosForn,
          meta: {
            isSupplierSLA: true,
            supplierName: forn,
            insight: `Valor total (estimado): ${fmtMoeda(total)}. Histórico de itens que impactam o SLA deste fornecedor.`
          }
        });
      });
    });
}

// Initialize Excel Import feature
initExcelImport(getClient(), toast, async () => {
  registros = await carregarRegistros();
  renderFiltros();
  refresh();
});

// ==========================================
// LOGICA PREVENTIVA
// ==========================================
let editandoPreventiva = null;
let filtrosPreventiva = {
  busca: '',
  status: 'TODOS',
  plano: 'TODOS',
  mes: ''
};

function renderFiltrosPreventiva() {
  const selectStatus = $('#filtroStatusPreventiva');
  if (selectStatus) {
    const statuses = [...new Set(registrosPreventiva.map(r => r.status_auditoria).filter(Boolean))].sort();
    selectStatus.innerHTML = '<option value="TODOS">TODOS</option>' + statuses.map(s => `<option value="${s}">${s}</option>`).join('');
    selectStatus.value = filtrosPreventiva.status;
  }
}

function aplicarFiltrosPreventiva() {
  const base = registrosPreventiva.filter(r => {
    if (filtrosPreventiva.status !== 'TODOS' && r.status_auditoria !== filtrosPreventiva.status) return false;
    if (filtrosPreventiva.busca) {
      const q = filtrosPreventiva.busca.toLowerCase();
      const mach = String(r.maquina || '').toLowerCase();
      const iden = String(r.identificador || '').toLowerCase();
      if (!mach.includes(q) && !iden.includes(q)) return false;
    }
    return true;
  });

  const map = new Map();
  for (const r of base) {
    const key = `${r.maquina}_${r.identificador}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  const finalResults = [];
  for (const records of map.values()) {
    let selected = null;
    if (filtrosPreventiva.mes && filtrosPreventiva.linha) {
      selected = records.find(r => r.mes === filtrosPreventiva.mes && r.linha === filtrosPreventiva.linha);
    } else if (filtrosPreventiva.mes) {
      selected = records.find(r => r.mes === filtrosPreventiva.mes);
    }
    
    if (!selected) {
      selected = records.find(r => !r.mes || r.mes === '');
    }

    if (selected) {
      if (filtrosPreventiva.plano !== 'TODOS' && selected.plano_padrao !== filtrosPreventiva.plano) continue;
      finalResults.push(selected);
    }
  }
  return finalResults;
}

$('#filtroBuscaPreventiva')?.addEventListener('input', (e) => {
  filtrosPreventiva.busca = e.target.value;
  renderTabelaPreventiva();
});

$('#filtroStatusPreventiva')?.addEventListener('change', (e) => {
  filtrosPreventiva.status = e.target.value;
  renderTabelaPreventiva();
});

$('#filtroPlanoPreventiva')?.addEventListener('change', (e) => {
  filtrosPreventiva.plano = e.target.value;
  renderTabelaPreventiva();
});

$('#btnLimparFiltrosPreventiva')?.addEventListener('click', () => {
  filtrosPreventiva = { busca: '', status: 'TODOS', plano: 'TODOS' };
  $('#filtroBuscaPreventiva').value = '';
  $('#filtroStatusPreventiva').value = 'TODOS';
  $('#filtroPlanoPreventiva').value = 'TODOS';
  renderTabelaPreventiva();
});

function renderTabelaPreventiva() {
  const tbody = $('#tabelaPreventiva');
  if (!tbody) return;

  const filtrados = aplicarFiltrosPreventiva();

  if (!filtrados || filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Nenhum registro de preventiva encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((r, idx) => `
    <tr>
      <td><strong>#${idx + 1}</strong></td>
      <td>${r.maquina || '—'}</td>
      <td style="min-width:350px; white-space:normal; line-height:1.5; padding: 12px; color: var(--text);">
        ${(Array.isArray(r.atividades_descricoes) && r.atividades_descricoes.length 
          ? r.atividades_descricoes.map(d => `<div style="margin-bottom:0.5rem;">• ${String(d).replace(/\n/g, '<br>')}</div>`).join('') 
          : (r.descricao ? String(r.descricao).replace(/\n/g, '<br>') : '-'))}
      </td>
      <td>${r.duracao_horas != null && r.duracao_horas !== '' ? r.duracao_horas + 'h' : '—'}</td>
      <td>${r.hh_mec != null && r.hh_mec !== 0 ? r.hh_mec : '—'}</td>
      <td>${r.hh_eletrico != null && r.hh_eletrico !== 0 ? r.hh_eletrico : '—'}</td>
      <td><span class="badge ${r.status_auditoria === 'FINALIZADO' ? 'badge-success' : r.status_auditoria ? 'badge-warning' : ''}">${r.status_auditoria || '—'}</span></td>
      <td>${Number(r.previsao_custos || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
      <td>
        <button type="button" class="btn-icon" onclick="abrirDetalhePreventivaPanel('${r.id}')" title="Ver Detalhes" style="margin-right: 0.5rem; background: var(--primary); color: white; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; width: auto; font-family: inherit;">Ver Detalhes</button>
        <button type="button" class="btn-icon" onclick="abrirFormularioPreventiva('${r.id}')" title="Editar">✏️</button>
      </td>
    </tr>
  `).join('');
}

window.abrirFormularioPreventiva = function(id) {
  editandoPreventiva = id ? registrosPreventiva.find(r => String(r.id) === String(id)) : {
    identificador: '', maquina: '', material: [], plano_padrao: 'S', duracao_horas: 0, hh_mec: 0, hh_eletrico: 0,
    resp_fabrica: '', resp_manutencao: '', status_auditoria: '', previsao_custos: 0, atividades_descricoes: [], programacao: []
  };

  if (!editandoPreventiva) return;

  const f = $('#formRegistroPreventiva');
  f.id.value = editandoPreventiva.id || '';
  f.identificador.value = editandoPreventiva.identificador || '';
  f.maquina.value = editandoPreventiva.maquina || '';
  f.plano_padrao.value = editandoPreventiva.plano_padrao || 'S';
  f.duracao_horas.value = editandoPreventiva.duracao_horas || '';
  f.hh_mec.value = editandoPreventiva.hh_mec || '';
  f.hh_eletrico.value = editandoPreventiva.hh_eletrico || '';
  f.resp_fabrica.value = editandoPreventiva.resp_fabrica || '';
  f.resp_manutencao.value = editandoPreventiva.resp_manutencao || '';
  f.status_auditoria.value = editandoPreventiva.status_auditoria || '';
  f.previsao_custos.value = editandoPreventiva.previsao_custos || '';

  renderDescricoesPreventiva();
  renderMateriaisPreventiva();
  renderProgramacaoPreventiva();

  $('#btnExcluirPreventivaModal').style.display = editandoPreventiva.id ? 'inline-flex' : 'none';
  $('#formTituloPreventiva').textContent = id ? 'Editar Preventiva' : 'Nova Preventiva';
  showView('form-preventiva');
};

function renderDescricoesPreventiva() {
  const lista = $('#listaDescricoesPreventiva');
  if (!editandoPreventiva.atividades_descricoes?.length) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição. Clique em "+ Adicionar" abaixo.</p>';
    return;
  }
  lista.innerHTML = editandoPreventiva.atividades_descricoes.map((desc, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="desc-input" data-idx="${idx}" rows="3" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem 0.75rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;line-height:1.5;">${desc}</textarea>
      <button type="button" class="btn-icon" onclick="window.removerDescricaoPreventiva(${idx})" title="Remover" style="margin-top:0.25rem;opacity:0.7;">✕</button>
    </div>
  `).join('');
  
  lista.querySelectorAll('.desc-input').forEach(el => {
    el.addEventListener('input', (e) => {
      editandoPreventiva.atividades_descricoes[e.target.dataset.idx] = e.target.value;
    });
  });
}

window.removerDescricaoPreventiva = function(idx) {
  editandoPreventiva.atividades_descricoes.splice(idx, 1);
  renderDescricoesPreventiva();
};

$('#btnNovaDescricaoPreventiva')?.addEventListener('click', () => {
  if (!editandoPreventiva.atividades_descricoes) editandoPreventiva.atividades_descricoes = [];
  editandoPreventiva.atividades_descricoes.push('');
  renderDescricoesPreventiva();
});

window.removerMaterialPreventiva = function(idx) {
  if (confirm('Remover este material?')) {
    editandoPreventiva.material.splice(idx, 1);
    renderMateriaisPreventiva();
  }
};

function renderMateriaisPreventiva() {
  const lista = $('#listaMateriaisPreventiva');
  if (!lista) return;
  if (!editandoPreventiva.material?.length) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material. Clique em "+ Adicionar" abaixo.</p>';
    return;
  }
  lista.innerHTML = editandoPreventiva.material.map((mat, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="mat-input" data-idx="${idx}" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem 0.75rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;line-height:1.5;">${mat}</textarea>
      <button type="button" class="btn-icon" onclick="window.removerMaterialPreventiva(${idx})" title="Remover" style="margin-top:0.25rem;opacity:0.7;">❌</button>
    </div>
  `).join('');

  lista.querySelectorAll('.mat-input').forEach(el => {
    el.addEventListener('input', (e) => {
      editandoPreventiva.material[e.target.dataset.idx] = e.target.value;
    });
  });
}

$('#btnNovoMaterialPreventiva')?.addEventListener('click', () => {
  if (!editandoPreventiva.material) editandoPreventiva.material = [];
  editandoPreventiva.material.push('');
  renderMateriaisPreventiva();
});

function renderProgramacaoPreventiva() {
  const lista = $('#listaProgramacao');
  if (!Array.isArray(editandoPreventiva.programacao)) {
    editandoPreventiva.programacao = [];
  }
  if (!editandoPreventiva.programacao.length) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum dia programado. Clique em "+ Adicionar Dia/Turno" abaixo.</p>';
    return;
  }
  const inputStyle = 'background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.4rem 0.6rem;font-family:\'DM Sans\',sans-serif;font-size:0.875rem;';
  lista.innerHTML = editandoPreventiva.programacao.map((prog, idx) => `
    <div style="display:flex;gap:0.5rem;align-items:center;background:rgba(255,255,255,0.04);padding:0.5rem 0.75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.07);">
      <span style="font-size:0.75rem;color:var(--muted);min-width:28px;">#${idx+1}</span>
      <input type="text" class="prog-data" data-idx="${idx}" placeholder="Ex: 23/03" value="${prog.data || ''}" style="width:90px;${inputStyle}" />
      <select class="prog-turno" data-idx="${idx}" style="${inputStyle}">
        <option value="DIA" ${prog.turno === 'DIA' ? 'selected' : ''}>☀ DIA</option>
        <option value="NOITE" ${prog.turno === 'NOITE' ? 'selected' : ''}>🌙 NOITE</option>
      </select>
      <button type="button" class="btn-icon" onclick="window.removerProgramacaoPreventiva(${idx})" title="Remover" style="opacity:0.6;margin-left:auto;">✕</button>
    </div>
  `).join('');
  
  lista.querySelectorAll('.prog-data, .prog-turno').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = e.target.dataset.idx;
      if (e.target.classList.contains('prog-data')) editandoPreventiva.programacao[idx].data = e.target.value;
      if (e.target.classList.contains('prog-turno')) editandoPreventiva.programacao[idx].turno = e.target.value;
    });
  });
}

window.removerProgramacaoPreventiva = function(idx) {
  editandoPreventiva.programacao.splice(idx, 1);
  renderProgramacaoPreventiva();
};

$('#btnNovaProgramacao')?.addEventListener('click', () => {
  if (!editandoPreventiva.programacao) editandoPreventiva.programacao = [];
  editandoPreventiva.programacao.push({ data: '', turno: 'DIA' });
  renderProgramacaoPreventiva();
});

$('#formRegistroPreventiva')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('#formRegistroPreventiva');
  const payload = {
    ...editandoPreventiva,
    identificador: f.identificador.value,
    maquina: f.maquina.value,
    material: editandoPreventiva.material?.filter(m => m.trim()) || [],
    plano_padrao: f.plano_padrao.value,
    duracao_horas: parseFloat(f.duracao_horas.value) || 0,
    hh_mec: parseFloat(f.hh_mec.value) || 0,
    hh_eletrico: parseFloat(f.hh_eletrico.value) || 0,
    resp_fabrica: f.resp_fabrica.value,
    resp_manutencao: f.resp_manutencao.value,
    status_auditoria: f.status_auditoria.value,
    previsao_custos: parseFloat(f.previsao_custos.value) || 0,
  };
  
  const isFallback = !editandoPreventiva.mes || editandoPreventiva.linha !== estadoPlanos.linha || editandoPreventiva.mes !== estadoPlanos.mes;
  if (isFallback && estadoPlanos.mes && (viewAtual === 'controle-preventiva' || viewAtual === 'preventiva-l06')) {
    delete payload.id;
    payload.mes = estadoPlanos.mes;
    payload.linha = estadoPlanos.linha;
    payload.plano_padrao = 'N';
  }
  
  try {
    await salvarPreventiva(payload);
    registrosPreventiva = await carregarPreventiva();
    showView(viewAtual === 'form-preventiva' ? 'preventiva-l06-backend' : viewAtual);
    toast('Preventiva salva com sucesso.', 'success');
    renderTabelaPreventiva();
  } catch (err) {
    toast('Erro ao salvar preventiva: ' + err.message, 'error');
  }
});

$('#btnFecharFormPreventiva')?.addEventListener('click', () => showView(viewAtual === 'form-preventiva' ? 'preventiva-l06-backend' : viewAtual));
$('#btnCancelarFormPreventiva')?.addEventListener('click', () => showView(viewAtual === 'form-preventiva' ? 'preventiva-l06-backend' : viewAtual));
$('#btnNovaPreventiva')?.addEventListener('click', () => window.abrirFormularioPreventiva(null));
$('#btnNovaLinhaLanding')?.addEventListener('click', () => window.cadastrarNovaPreventiva());
$('#btnExcluirPreventivaModal')?.addEventListener('click', async () => {
  if (editandoPreventiva?.id && confirm('Excluir esta preventiva permanentemente?')) {
    try {
      await excluirPreventiva(editandoPreventiva.id);
      registrosPreventiva = await carregarPreventiva();
      showView(viewAtual === 'form-preventiva' ? 'preventiva-l06-backend' : viewAtual);
      toast('Preventiva excluída.', 'success');
      renderTabelaPreventiva();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  }
});

// Toggle Chart in Análise Mensal
$('#btnToggleChart')?.addEventListener('click', (e) => {
  const container = $('#chartContainer');
  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    e.target.textContent = 'Ocultar Gráfico';
    // Trigger resize so ECharts recalculates its width when it becomes visible
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 10);
  } else {
    container.classList.add('hidden');
    e.target.textContent = 'Mostrar Gráfico';
  }
});

// Intercept clicks on view toggles to update preventiva table
const originalShowView = showView;
showView = function(name) {
  originalShowView(name);
  if (name === 'planos-manutencao') {
    // Quando abre o navegador geral, reseta para o passo do mês se não estiver definido
    if (!estadoPlanos.mes) {
      planosGoToStep('mes');
    }
  }
};
window.showView = showView;

window.addEventListener('themeChanged', () => {
  if (viewAtual === 'dashboard' || viewAtual === 'consertos' || viewAtual === 'compras' || viewAtual === 'fabricacao') {
    refresh();
  }
});

// ==========================================
// DRILL-DOWN: Planos de Manutenção
// ==========================================
const estadoPlanos = {
  mes: null,
  linha: null,
  maquina: null
};

window.planosGoToStep = function(stepName) {
  if (stepName === 'mes') {
    estadoPlanos.mes = null;
    estadoPlanos.linha = null;
    estadoPlanos.maquina = null;
    $('#bc-sep-1').style.display = 'none';
    $('#bc-linha').style.display = 'none';
    $('#bc-sep-2').style.display = 'none';
    $('#bc-maquina').style.display = 'none';
    $('#bc-mes').style.color = 'var(--text)';
    $('#bc-mes').textContent = 'Selecione o Mês';
    
    $('#step-mes').style.display = 'block';
    $('#step-linha').style.display = 'none';
    $('#step-atividades').style.display = 'none';
  } else if (stepName === 'linha') {
    estadoPlanos.linha = null;
    estadoPlanos.maquina = null;
    $('#bc-sep-2').style.display = 'none';
    $('#bc-maquina').style.display = 'none';
    $('#bc-linha').style.color = 'var(--text)';
    
    $('#step-mes').style.display = 'none';
    $('#step-linha').style.display = 'block';
    $('#step-maquina-section').style.display = 'none';
    $('#step-atividades').style.display = 'none';
  }
};

window.selecionarMesPlanos = function(mes) {
  estadoPlanos.mes = mes;
  $('#bc-sep-1').style.display = 'block';
  $('#bc-linha').style.display = 'block';
  $('#bc-linha').textContent = 'Linha';
  $('#bc-mes').style.color = 'var(--muted)';
  $('#bc-mes').textContent = mes;
  $('#bc-linha').style.color = 'var(--text)';
  
  $('#step-linha-mes-label').textContent = mes;
  
  // Render linhas
  const linhas = ['L04', 'L05', 'L06', 'L07', 'L08', 'L09'];
  $('#step-mes').style.display = 'none';
  $('#step-linha').style.display = 'block';
  $('#step-maquina-section').style.display = 'none';
  const calSec = $('#calendario-preventiva-section');
  if (calSec) calSec.style.display = 'flex';
  $('#step-atividades').style.display = 'none';

  carregarCheckinsPreventiva(mes).then(() => {
    const html = linhas.map(l => {
      const diasGravados = checkinsPreventiva.filter(c => c.linha === l).map(c => c.dia).sort((a,b)=>a-b);
      const labelDias = diasGravados.length > 0 ? `<div id="dias-label-${l}" style="font-size:0.75rem; color:var(--muted); text-align:right; margin-top:2px;">Dias: ${diasGravados.join(', ')}</div>` : `<div id="dias-label-${l}" style="font-size:0.75rem; color:var(--muted); text-align:right; margin-top:2px;"></div>`;
      return `<div style="display:flex; flex-direction:column; margin-bottom: 0.5rem;">
        <div style="display:flex; gap:0.25rem; align-items:stretch;">
          <button class="btn btn-outline" style="flex:1; text-align: left; justify-content: flex-start; font-size:0.9rem; padding: 0.4rem 0.6rem;" onclick="selecionarLinhaPlanos('${l}')">Linha ${l.replace('L','')}</button>
          <div class="linha-dia-inputs" style="display:flex; gap:2px;">
            <input type="number" min="1" max="31" class="preventiva-dia-input" data-linha="${l}" value="" placeholder="+" title="Adicionar dia" style="width:45px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); color:var(--text); text-align:center; font-size:0.9rem;" onchange="salvarDiaLinhaPreventiva('${mes}', '${l}', this.value)" />
            <button type="button" onclick="salvarDiaLinhaPreventiva('${mes}', '${l}', '')" title="Remover último dia" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); border-radius:4px; width:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>
        ${labelDias}
      </div>`;
    }).join('');
    $('#linhas-list').innerHTML = html;
    renderCalendarioPreventiva(mes, false);
  });
};

window.selecionarLinhaPlanos = async function(linha) {
  estadoPlanos.linha = linha;
  $('#bc-linha').textContent = `Linha ${linha.replace('L','')}`;
  $('#linha-dashboard-title').textContent = `Dashboard - Linha ${linha.replace('L','')}`;
  
  const calSec2 = $('#calendario-preventiva-section');
  if (calSec2) calSec2.style.display = 'none';
  $('#step-maquina-section').style.display = 'block';

  document.querySelectorAll('#linhas-list .linha-dia-inputs').forEach(el => el.style.display = 'none');
  
  // Buscar máquinas para exibir no grid (Apenas do plano de preventiva)
  let maquinasPrev = opcoesUnicas(registrosPreventiva, 'maquina');
  maquinasPrev = maquinasPrev.filter(m => !['FRONTEND', 'GERAL', 'MAQUINA'].includes(m.toUpperCase()));
  const maquinasArray = Array.from(new Set([...maquinasPrev])).sort();
  if (maquinasArray.length === 0) {
    maquinasArray.push('ABASTECIMENTO', 'ACUMULADORES', 'FORNO', 'IMPRESSORA', 'LAVADORA', 'PRENSA', 'QUEIMADORES', 'TORNO', 'VERNIZ INTERNO');
  }

  // Atualizar KPIs da linha usando os registros das máquinas
  const regs = registrosPreventiva.filter(r => maquinasArray.includes(r.maquina));
  $('#kpi-linha-atividades').textContent = regs.length || 0;
  
  let totalHH = 0;
  let totalCusto = 0;
  regs.forEach(r => {
    totalHH += (parseFloat(r.hh_mec) || 0) + (parseFloat(r.hh_eletrico) || 0) + (parseFloat(r.hh_lub) || 0);
    totalCusto += parseFloat(r.previsao_custos) || 0;
  });
  $('#kpi-linha-hh').textContent = totalHH.toFixed(1) + 'h';
  $('#kpi-linha-custo').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCusto);
  // Buscar máquinas para exibir no grid (Apenas do plano de preventiva)
  try {
    const html = maquinasArray.map(m => `
      <div class="kpi-card" tabindex="0" onclick="selecionarMaquinaPlanos('${m}', '${m}')" style="cursor:pointer; padding:1rem; border-color:rgba(110,231,183,0.15); transition:background 0.2s;">
        <div style="font-weight:500; font-size:0.95rem;">${m}</div>
        <div style="font-size:0.75rem; color:var(--muted); margin-top:0.25rem;">${regs.filter(r => r.maquina === m).length} atividades</div>
      </div>
    `).join('');
    $('#maquinas-grid-planos').innerHTML = html;
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar máquinas.', 'error');
  }
};

window.selecionarMaquinaPlanos = function(maquinaId, maquinaNome) {
  estadoPlanos.maquina = maquinaNome;
  
  $('#bc-sep-2').style.display = 'block';
  $('#bc-maquina').style.display = 'block';
  $('#bc-maquina').textContent = maquinaNome;
  $('#bc-linha').style.color = 'var(--muted)';
  
  $('#atividades-maquina-title').textContent = maquinaNome;
  $('#atividades-maquina-subtitle').textContent = `Linha ${estadoPlanos.linha.replace('L','')} - ${estadoPlanos.mes}`;
  
  $('#step-linha').style.display = 'none';
  $('#step-atividades').style.display = 'block';
  
  // Set filters for the renderTabelaPreventiva
  filtrosPreventiva.busca = maquinaNome; // Using busca to filter by machine for now
  filtrosPreventiva.mes = estadoPlanos.mes;
  filtrosPreventiva.linha = estadoPlanos.linha;
  
  renderFiltrosPreventiva();
  renderTabelaPreventiva();
};

// Initialize Preventiva Import
initExcelImportPreventiva(getClient(), toast, async () => {
  const todos = await carregarPreventiva();
  registrosPreventivaFrontend = todos.filter(r => r.setor === 'frontend');
  registrosPreventiva = todos.filter(r => r.setor !== 'frontend');
  if (viewAtual === 'preventiva-l06-backend' || viewAtual === 'planos-manutencao') { renderFiltrosPreventiva(); renderTabelaPreventiva(); }
  if (viewAtual === 'controle-preventiva' || viewAtual === 'preventiva-l06') renderControlePreventiva();
  if (viewAtual === 'por-maquina') { renderMachineList(); renderMachineActivities(); }
});

// View Detalhes Panel para Preventiva
window.abrirDetalhePreventivaPanel = function(id) {
  let r = registrosPreventiva.find((x) => String(x.id) === String(id));
  if (!r) r = registrosPreventivaFrontend.find((x) => String(x.id) === String(id));
  if (!r) return;
  window.linhaSelecionadaPreventivaId = id;
  document.querySelectorAll('#machineActivitiesTable tbody tr').forEach(tr => {
    tr.classList.toggle('row-selected', String(tr.dataset.id) === String(id));
  });

  const panel = document.getElementById('drillPanel');
  const overlay = document.getElementById('drillOverlay');
  if (!panel) return;

  const primeiraAtiv = Array.isArray(r.atividades_descricoes) && r.atividades_descricoes.length > 0 ? String(r.atividades_descricoes[0]) : (r.descricao ? String(r.descricao) : 'Plano de Manutenção');
  const tituloTruncado = primeiraAtiv.length > 60 ? primeiraAtiv.substring(0, 57) + '...' : primeiraAtiv;
  document.getElementById('drillTitulo').textContent = tituloTruncado;
  document.getElementById('drillSubtitulo').textContent = `${r.maquina || ''} · ID: ${r.identificador || 'N/A'}`;

  const stats = [
    { label: 'Plano Padrão', value: r.plano_padrao || '-' },
    { label: 'Duração', value: r.duracao_horas ? r.duracao_horas + 'h' : '-' },
    { label: 'HH Mecânico', value: r.hh_mec || '-' },
    { label: 'HH Elétrico', value: r.hh_eletrico || '-' },
    { label: 'Resp. Fábrica', value: r.resp_fabrica || '-' },
    { label: 'Resp. Manutenção', value: r.resp_manutencao || '-' },
    { label: 'Status/Auditoria', value: r.status_auditoria || '-' },
    { label: 'Custo Previsto', value: Number(r.previsao_custos || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
  ];

  document.getElementById('drillStats').innerHTML = stats
    .map(
      (s) => `
    <div class="drill-stat">
      <span>${s.label}</span>
      <strong>${s.value}</strong>
    </div>`
    )
    .join('');

  document.getElementById('drillInsight').style.display = 'none';

  const formatCards = (text) => {
    const safeText = String(text || '');
    if (!safeText || safeText.trim() === '' || safeText === 'Sem descrição' || safeText === 'Nenhum material especificado' || safeText === 'undefined') {
      return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">Não informado</p>`;
    }
    // Quebra por \n real (não literal)
    const steps = safeText.split(/\n/)
                      .map(s => s.trim().replace(/^[-–]/, '').trim())
                      .filter(s => s.length > 1);
    
    if (steps.length === 0) return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">${safeText}</p>`;

    return steps.map((step, idx) => `
      <div style="background: var(--bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 0.75rem; display: flex; gap: 1rem; align-items: flex-start; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <span style="background: rgba(212, 175, 55, 0.15); color: var(--primary); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: bold; flex-shrink: 0; border: 1px solid rgba(212, 175, 55, 0.3);">${idx + 1}</span>
        <span style="font-size: 0.95rem; line-height: 1.5; color: var(--text); padding-top: 2px;">${step}</span>
      </div>
    `).join('');
  };

  // Descrição: usa atividades_descricoes (array do importador) ou descricao (campo texto)
  let rawDesc;
  if (r.atividades_descricoes && Array.isArray(r.atividades_descricoes) && r.atividades_descricoes.length > 0) {
    rawDesc = r.atividades_descricoes.join('\n');
  } else if (r.descricao) {
    rawDesc = r.descricao;
  } else {
    rawDesc = 'Não informado';
  }

  // Material: pode vir como array ou string com \n reais
  let rawMat;
  if (r.material && Array.isArray(r.material) && r.material.length > 0) {
    rawMat = r.material.join('\n');
  } else if (r.material && !Array.isArray(r.material) && String(r.material) !== 'undefined' && String(r.material).trim() !== '') {
    rawMat = String(r.material);
  } else {
    rawMat = 'Não informado';
  }

  const descHTML = formatCards(rawDesc);
  const matHTML = formatCards(rawMat);

  // Programação (datas/turnos) se existir
  let progHTML = '';
  if (r.programacao && Array.isArray(r.programacao) && r.programacao.length > 0) {
    progHTML = `
      <h4 style="margin-top: 2rem; color:var(--text); margin-bottom: 1rem; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        Programação
      </h4>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        ${r.programacao.map(p => `<span style="background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem;">${p.data} ${p.turno}</span>`).join('')}
      </div>`;
  }

  const lista = document.getElementById('drillLista');
  lista.innerHTML = `
      <article class="drill-item" style="padding: 1.5rem; background: transparent; border: none;">
        <h4 style="margin-top:0; color:var(--text); margin-bottom: 1rem; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Descrição
        </h4>
        ${descHTML}
        
        <h4 style="margin-top: 2rem; color:var(--text); margin-bottom: 1rem; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          Materiais Necessários
        </h4>
        ${matHTML}
        ${progHTML}
        
        <div class="drill-item-actions" style="margin-top: 2rem;">
          <button type="button" class="btn-primary" onclick="${r.setor === 'frontend' ? 'abrirFormularioPreventivaFE' : 'abrirFormularioPreventiva'}('${r.id}'); fecharDrilldown();" style="width: 100%;">✏️ Editar Atividade</button>
        </div>
      </article>`;

  panel.classList.add('open');
  overlay.classList.add('open');
};

// Initialize Frontend Preventiva Import (isolated — only touches setor='frontend')
initExcelImportPreventivaFrontend(getClient(), toast, async () => {
  const todos = await carregarPreventiva();
  registrosPreventivaFrontend = todos.filter(r => r.setor === 'frontend');
  registrosPreventiva = todos.filter(r => r.setor !== 'frontend');
  if (viewAtual === 'planos-manutencao-frontend' || viewAtual === 'plano-preventiva-frontend') {
    renderTabelaPreventivaFE();
  }
  if (viewAtual === 'por-maquina') {
    renderMachineList();
    renderMachineActivities();
  }
});

// ==========================================
// LÓGICA FRONT-END — NAVEGADOR GERAL
// ==========================================
const estadoPlanosFrontend = { mes: null, linha: null, maquina: null };
let filtrosPreventivaFE = { busca: '', status: 'TODOS' };

window.planosGoToStepFrontend = function(stepName) {
  if (stepName === 'mes') {
    estadoPlanosFrontend.mes = null;
    estadoPlanosFrontend.linha = null;
    estadoPlanosFrontend.maquina = null;
    $('#bc-sep-1-fe').style.display = 'none';
    $('#bc-linha-fe').style.display = 'none';
    $('#bc-sep-2-fe').style.display = 'none';
    $('#bc-maquina-fe').style.display = 'none';
    $('#bc-mes-fe').style.color = 'var(--text)';
    $('#bc-mes-fe').textContent = 'Selecione o Mês';
    $('#step-mes-fe').style.display = 'block';
    $('#step-linha-fe').style.display = 'none';
    $('#step-atividades-fe').style.display = 'none';
  } else if (stepName === 'linha') {
    estadoPlanosFrontend.linha = null;
    estadoPlanosFrontend.maquina = null;
    $('#bc-sep-2-fe').style.display = 'none';
    $('#bc-maquina-fe').style.display = 'none';
    $('#bc-linha-fe').style.color = 'var(--text)';
    $('#step-mes-fe').style.display = 'none';
    $('#step-linha-fe').style.display = 'block';
    $('#step-maquina-section-fe').style.display = 'none';
    $('#step-atividades-fe').style.display = 'none';
  }
};

window.selecionarMesPlansosFrontend = function(mes) {
  estadoPlanosFrontend.mes = mes;
  $('#bc-sep-1-fe').style.display = 'block';
  $('#bc-linha-fe').style.display = 'block';
  $('#bc-linha-fe').textContent = 'Linha';
  $('#bc-mes-fe').style.color = 'var(--muted)';
  $('#bc-mes-fe').textContent = mes;
  $('#bc-linha-fe').style.color = 'var(--text)';
  const label = $('#step-linha-mes-label-fe');
  if (label) label.textContent = mes;
  const linhas = ['L04', 'L05', 'L06', 'L07', 'L08', 'L09'];
  $('#step-mes-fe').style.display = 'none';
  $('#step-linha-fe').style.display = 'block';
  $('#step-maquina-section-fe').style.display = 'none';
  const calSecFE = $('#calendario-preventiva-section-fe');
  if (calSecFE) calSecFE.style.display = 'flex';
  $('#step-atividades-fe').style.display = 'none';

  carregarCheckinsPreventiva(mes).then(() => {
    const html = linhas.map(l => {
      const diasGravados = checkinsPreventiva.filter(c => c.linha === l).map(c => c.dia).sort((a,b)=>a-b);
      const labelDias = diasGravados.length > 0 ? `<div id="dias-label-fe-${l}" style="font-size:0.75rem; color:var(--muted); text-align:right; margin-top:2px;">Dias: ${diasGravados.join(', ')}</div>` : `<div id="dias-label-fe-${l}" style="font-size:0.75rem; color:var(--muted); text-align:right; margin-top:2px;"></div>`;
      return `<div style="display:flex; flex-direction:column; margin-bottom: 0.5rem;">
        <div style="display:flex; gap:0.25rem; align-items:stretch;">
          <button class="btn btn-outline" style="flex:1; text-align: left; justify-content: flex-start; font-size:0.9rem; padding: 0.4rem 0.6rem;" onclick="selecionarLinhaPlanosFrontend('${l}')">Linha ${l.replace('L','')}</button>
          <div class="linha-dia-inputs" style="display:flex; gap:2px;">
            <input type="number" min="1" max="31" class="preventiva-dia-input" data-linha="${l}" value="" placeholder="+" title="Adicionar dia" style="width:45px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); color:var(--text); text-align:center; font-size:0.9rem;" onchange="salvarDiaLinhaPreventiva('${mes}', '${l}', this.value)" />
            <button type="button" onclick="salvarDiaLinhaPreventiva('${mes}', '${l}', '')" title="Remover último dia" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); border-radius:4px; width:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>
        ${labelDias}
      </div>`;
    }).join('');
    const el = $('#linhas-list-fe');
    if (el) el.innerHTML = html;
    renderCalendarioPreventiva(mes, true);
  });
};

window.selecionarLinhaPlanosFrontend = function(linha) {
  estadoPlanosFrontend.linha = linha;
  const linhaLabel = `Linha ${linha.replace('L', '')}`;
  $('#bc-linha-fe').textContent = linhaLabel;
  const titleEl = $('#linha-dashboard-title-fe');
  if (titleEl) titleEl.textContent = `Dashboard — ${linhaLabel} · Front-end`;

  const calSecFE2 = $('#calendario-preventiva-section-fe');
  if (calSecFE2) calSecFE2.style.display = 'none';
  $('#step-maquina-section-fe').style.display = 'block';

  document.querySelectorAll('#linhas-list-fe .linha-dia-inputs').forEach(el => el.style.display = 'none');

  // KPIs
  const regs = registrosPreventivaFrontend;
  $('#kpi-linha-atividades-fe').textContent = regs.length || 0;
  let totalHH = 0;
  regs.forEach(r => { totalHH += (parseFloat(r.hh_mec) || 0) + (parseFloat(r.hh_eletrico) || 0) + (parseFloat(r.hh_lub) || 0); });
  $('#kpi-linha-hh-fe').textContent = totalHH.toFixed(1) + 'h';
  const freqs = regs.map(r => parseFloat(r.frequencia_meses)).filter(v => v > 0);
  const freqMedia = freqs.length ? (freqs.reduce((a, b) => a + b, 0) / freqs.length).toFixed(1) : '—';
  const freqEl = $('#kpi-linha-freq-fe');
  if (freqEl) freqEl.textContent = freqMedia !== '—' ? freqMedia + ' meses' : '—';

  // Grid de máquinas do front-end
  const maquinasUnicas = [...new Set(regs.map(r => r.maquina).filter(Boolean))].sort();
  const maquinasDisplay = maquinasUnicas.length > 0
    ? maquinasUnicas
    : ['ESMALTADEIRA', 'IMPRESSORA', 'VERNIZ EXTERNO', 'DECORAÇÃO', 'CONIFICADORA', 'EMBALADEIRA'];

  const html = maquinasDisplay.map(m =>
    `<div class="kpi-card" tabindex="0" onclick="selecionarMaquinaPlanosFrontend('${m}')" style="cursor:pointer; padding:1rem; border-color:rgba(110,231,183,0.15); transition:background 0.2s;">
      <div style="font-weight:500; font-size:0.95rem;">${m}</div>
      <div style="font-size:0.75rem; color:var(--muted); margin-top:0.25rem;">${regs.filter(r => r.maquina === m).length} atividades</div>
    </div>`
  ).join('');
  const grid = $('#maquinas-grid-planos-fe');
  if (grid) grid.innerHTML = html;
};

window.selecionarMaquinaPlanosFrontend = function(maquinaNome) {
  estadoPlanosFrontend.maquina = maquinaNome;
  $('#bc-sep-2-fe').style.display = 'block';
  $('#bc-maquina-fe').style.display = 'block';
  $('#bc-maquina-fe').textContent = maquinaNome;
  $('#bc-linha-fe').style.color = 'var(--muted)';
  const titleEl = $('#atividades-maquina-title-fe');
  if (titleEl) titleEl.textContent = maquinaNome;
  const subEl = $('#atividades-maquina-subtitle-fe');
  if (subEl) subEl.textContent = `Linha ${(estadoPlanosFrontend.linha || 'L06').replace('L', '')} — ${estadoPlanosFrontend.mes || ''} · Front-end`;
  $('#step-linha-fe').style.display = 'none';
  $('#step-atividades-fe').style.display = 'block';
  filtrosPreventivaFE.busca = maquinaNome;
  filtrosPreventivaFE.mes = estadoPlanosFrontend.mes;
  filtrosPreventivaFE.linha = estadoPlanosFrontend.linha;
  renderTabelaPreventivaFE();
};

function aplicarFiltrosFrontend() {
  const base = registrosPreventivaFrontend.filter(r => {
    if (filtrosPreventivaFE.status !== 'TODOS' && r.status_auditoria !== filtrosPreventivaFE.status) return false;
    if (filtrosPreventivaFE.busca) {
      const q = filtrosPreventivaFE.busca.toLowerCase();
      if (!String(r.maquina || '').toLowerCase().includes(q) &&
          !String(r.identificador || '').toLowerCase().includes(q) &&
          !String(r.descricao || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const map = new Map();
  for (const r of base) {
    const key = `${r.maquina}_${r.identificador}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  const finalResults = [];
  for (const records of map.values()) {
    let selected = null;
    if (filtrosPreventivaFE.mes && filtrosPreventivaFE.linha) {
      selected = records.find(r => r.mes === filtrosPreventivaFE.mes && r.linha === filtrosPreventivaFE.linha);
    } else if (filtrosPreventivaFE.mes) {
      selected = records.find(r => r.mes === filtrosPreventivaFE.mes);
    }
    
    if (!selected) {
      selected = records.find(r => !r.mes || r.mes === '');
    }

    if (selected) {
      finalResults.push(selected);
    }
  }
  return finalResults;
}

function renderTabelaPreventivaFE() {
  const tbody = $('#tabelaPreventivaFE');
  if (!tbody) return;
  const filtrados = aplicarFiltrosFrontend();
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">Nenhuma atividade Front-end encontrada</td></tr>';
    return;
  }
  tbody.innerHTML = filtrados.map((r, i) => {
    const isEdited = window.editedPlanoItemsFE && window.editedPlanoItemsFE.has(r.id);
    return `<tr ondblclick="abrirFormularioPreventivaFE('${r.id}')" style="cursor:pointer; ${isEdited ? 'background-color: rgba(110,231,183,0.08); border-left: 3px solid #6ee7b7;' : ''}">
      <td style="position: relative;">${isEdited ? '<div class="floatFadeCard" style="border-color:#6ee7b7;color:#6ee7b7;box-shadow:0 0 10px rgba(110,231,183,0.3)">Salvo</div>' : ''}<strong>#${i + 1}</strong></td>
      <td>${r.maquina || '—'}</td>
      <td style="min-width:350px; white-space:normal; line-height:1.5; padding: 12px; color: var(--text);">
        ${(Array.isArray(r.atividades_descricoes) && r.atividades_descricoes.length 
          ? r.atividades_descricoes.map(d => `<div style="margin-bottom:0.5rem;">• ${String(d).replace(/\n/g, '<br>')}</div>`).join('') 
          : (r.descricao ? String(r.descricao).replace(/\n/g, '<br>') : '-'))}
      </td>
      <td>${r.duracao_horas != null && r.duracao_horas !== '' ? r.duracao_horas + 'h' : '—'}</td>
      <td>${r.hh_mec || '—'}</td>
      <td>${r.hh_eletrico || '—'}</td>
      <td>${r.hh_lub || '—'}</td>
      <td>${r.frequencia_meses ? r.frequencia_meses + ' meses' : '—'}</td>
      <td>${r.sugestao || r.resp_fabrica || '—'}</td>
      <td><span class="badge ${r.status_auditoria === 'FINALIZADO' ? 'badge-success' : r.status_auditoria ? 'badge-warning' : ''}">${r.status_auditoria || '—'}</span></td>
      <td>
        <button type="button" class="btn-icon" onclick="abrirDetalhePreventivaFEPanel('${r.id}')" title="Ver Detalhes" style="margin-right: 0.5rem; background: var(--primary); color: white; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; width: auto; font-family: inherit;">Ver Detalhes</button>
        <button type="button" class="btn-icon" onclick="abrirFormularioPreventivaFE('${r.id}')" title="Editar">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

$('#filtroBuscaPreventivaFE')?.addEventListener('input', (e) => {
  filtrosPreventivaFE.busca = e.target.value;
  renderTabelaPreventivaFE();
});
$('#filtroStatusPreventivaFE')?.addEventListener('change', (e) => {
  filtrosPreventivaFE.status = e.target.value;
  renderTabelaPreventivaFE();
});
$('#btnLimparFiltrosPreventivaFE')?.addEventListener('click', () => {
  filtrosPreventivaFE = { busca: '', status: 'TODOS' };
  const busca = $('#filtroBuscaPreventivaFE');
  const status = $('#filtroStatusPreventivaFE');
  if (busca) busca.value = '';
  if (status) status.value = 'TODOS';
  renderTabelaPreventivaFE();
});
$('#btnNovaPreventivaFE')?.addEventListener('click', () => abrirFormularioPreventivaFE(null));

// Modal edição Frontend

// --- Frontend Generator UI ---
const renderDescricoesGeradorFE = (arr) => {
  const lista = document.getElementById('listaDescricoesGeradorFE');
  if (!lista) return;
  if (!arr || arr.length === 0) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
    return;
  }
  lista.innerHTML = arr.map((desc, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${String(desc).replace(/"/g, '&quot;')}</textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `).join('');
};
document.getElementById('btnNovaDescricaoGeradorFE')?.addEventListener('click', () => {
  const lista = document.getElementById('listaDescricoesGeradorFE');
  if (lista && lista.querySelector('p')) lista.innerHTML = '';
  lista?.insertAdjacentHTML('beforeend', `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `);
});

const renderMateriaisGeradorFE = (arr) => {
  const lista = document.getElementById('listaMateriaisGeradorFE');
  if (!lista) return;
  if (!arr || arr.length === 0) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material.</p>';
    return;
  }
  lista.innerHTML = arr.map((mat, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="mat-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${String(mat).replace(/"/g, '&quot;')}</textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `).join('');
};
document.getElementById('btnNovoMaterialGeradorFE')?.addEventListener('click', () => {
  const lista = document.getElementById('listaMateriaisGeradorFE');
  if (lista && lista.querySelector('p')) lista.innerHTML = '';
  lista?.insertAdjacentHTML('beforeend', `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="mat-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `);
});
// ------------------------------

let editandoPreventivaFE = null;

window.abrirFormularioPreventivaFE = function(id) {
  editandoPreventivaFE = id
    ? registrosPreventivaFrontend.find(r => String(r.id) === String(id))
    : { identificador: '', maquina: estadoPlanosFrontend.maquina || '', descricao: '',
        atividades_descricoes: [], duracao_horas: 0, hh_mec: 0, hh_eletrico: 0, hh_lub: 0,
        frequencia_meses: null, sugestao: '', status_auditoria: '', setor: 'frontend', area_producao: 'FRONT-END' };
  if (!editandoPreventivaFE) return;
  const f = $('#formEditarAtividadeFE');
  if (!f) return;
  $('#editAtivIdFE').value = editandoPreventivaFE.id || '';
  $('#editAtivIdentificadorFE').value = editandoPreventivaFE.identificador || '';
  $('#editAtivMaquinaFE').value = editandoPreventivaFE.maquina || '';
    const descArrFE = editandoPreventivaFE.atividades_descricoes?.length ? editandoPreventivaFE.atividades_descricoes : (editandoPreventivaFE.descricao ? [editandoPreventivaFE.descricao] : []);
    renderDescricoesGeradorFE(descArrFE);
    const matArrFE = Array.isArray(editandoPreventivaFE.material) ? editandoPreventivaFE.material : (editandoPreventivaFE.material ? [String(editandoPreventivaFE.material)] : []);
    renderMateriaisGeradorFE(matArrFE);
  $('#editAtivDuracaoFE').value = editandoPreventivaFE.duracao_horas || '';
  $('#editAtivHhMecFE').value = editandoPreventivaFE.hh_mec || '';
  $('#editAtivHhEleFE').value = editandoPreventivaFE.hh_eletrico || '';
  $('#editAtivHhLubFE').value = editandoPreventivaFE.hh_lub || '';
  $('#editAtivFreqFE').value = editandoPreventivaFE.frequencia_meses || '';
  $('#editAtivSugestaoFE').value = editandoPreventivaFE.sugestao || editandoPreventivaFE.resp_fabrica || '';
  $('#editAtivStatusFE').value = editandoPreventivaFE.status_auditoria || '';
  $('#modalEditarAtividadeFE').classList.add('open');
};

const fecharModalFE = () => $('#modalEditarAtividadeFE')?.classList.remove('open');
$('#btnFecharModalAtividadeFE')?.addEventListener('click', fecharModalFE);
$('#btnCancelarModalAtividadeFE')?.addEventListener('click', fecharModalFE);
$('#modalEditarAtividadeFE')?.addEventListener('click', (e) => { if (e.target === $('#modalEditarAtividadeFE')) fecharModalFE(); });

$('#formEditarAtividadeFE')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
  const materiais = Array.from(document.querySelectorAll('.mat-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
  const descricao = descricoes[0] || '';
  const payload = {
    ...editandoPreventivaFE,
    identificador: $('#editAtivIdentificadorFE').value.trim(),
    maquina: $('#editAtivMaquinaFE').value.trim(),
    atividades_descricoes: descricoes,
    material: materiais,
    duracao_horas: parseFloat($('#editAtivDuracaoFE').value) || 0,
    hh_mec: parseFloat($('#editAtivHhMecFE').value) || 0,
    hh_eletrico: parseFloat($('#editAtivHhEleFE').value) || 0,
    hh_lub: parseFloat($('#editAtivHhLubFE').value) || 0,
    frequencia_meses: parseInt($('#editAtivFreqFE').value) || null,
    sugestao: $('#editAtivSugestaoFE').value.trim(),
    resp_fabrica: $('#editAtivSugestaoFE').value.trim(),
    status_auditoria: $('#editAtivStatusFE').value,
    setor: 'frontend',
    area_producao: 'FRONT-END',
  };
  
  const isFallbackFE = !editandoPreventivaFE.mes || editandoPreventivaFE.linha !== estadoPlanosFrontend.linha || editandoPreventivaFE.mes !== estadoPlanosFrontend.mes;
  if (isFallbackFE && estadoPlanosFrontend.mes && (viewAtual === 'controle-preventiva' || viewAtual === 'preventiva-l06' || viewAtual === 'planos-manutencao')) {
    delete payload.id;
    payload.mes = estadoPlanosFrontend.mes;
    payload.linha = estadoPlanosFrontend.linha;
    payload.plano_padrao = 'N';
  }
  
  try {
    await salvarPreventiva(payload);
    if (window.editedPlanoItemsFE) window.editedPlanoItemsFE.add(payload.id);
    const todos = await carregarPreventiva();
    registrosPreventivaFrontend = todos.filter(r => r.setor === 'frontend');
    registrosPreventiva = todos.filter(r => r.setor !== 'frontend');
    fecharModalFE();
    toast('Atividade Front-end salva com sucesso.', 'success');
    renderTabelaPreventivaFE();
  } catch (err) {
    toast('Erro ao salvar: ' + err.message, 'error');
  }
});

// Painel de detalhes Frontend
window.abrirDetalhePreventivaFEPanel = function(id) {
  const r = registrosPreventivaFrontend.find(x => String(x.id) === String(id));
  if (!r) return;
  window.linhaSelecionadaPreventivaId = id;
  document.querySelectorAll('#machineActivitiesTable tbody tr').forEach(tr => {
    tr.classList.toggle('row-selected', String(tr.dataset.id) === String(id));
  });

  const panel = document.getElementById('drillPanel');
  const overlay = document.getElementById('drillOverlay');
  if (!panel) return;
  const primeiraAtiv = Array.isArray(r.atividades_descricoes) && r.atividades_descricoes.length > 0 ? String(r.atividades_descricoes[0]) : (r.descricao ? String(r.descricao) : 'Plano de Manutenção');
  const tituloTruncado = primeiraAtiv.length > 60 ? primeiraAtiv.substring(0, 57) + '...' : primeiraAtiv;
  document.getElementById('drillTitulo').textContent = tituloTruncado;
  document.getElementById('drillSubtitulo').textContent = `${r.maquina || ''} · Front-end`;
  const stats = [
    { label: 'Duração', value: r.duracao_horas ? r.duracao_horas + 'h' : '—' },
    { label: 'HH Mecânico', value: r.hh_mec || '—' },
    { label: 'HH Elétrico', value: r.hh_eletrico || '—' },
    { label: 'HH Lubrificação', value: r.hh_lub || '—' },
    { label: 'Frequência', value: r.frequencia_meses ? r.frequencia_meses + ' meses' : '—' },
    { label: 'Sugestão Resp.', value: r.sugestao || r.resp_fabrica || '—' },
    { label: 'Status', value: r.status_auditoria || '—' },
  ];
  document.getElementById('drillStats').innerHTML = stats.map(s =>
    `<div class="drill-stat"><span>${s.label}</span><strong>${s.value}</strong></div>`
  ).join('');
  document.getElementById('drillInsight').style.display = 'none';
  const desc = r.atividades_descricoes?.[0] || r.descricao || 'Não informado';
  
  // Extrair materiais se houver
  let rawMat;
  if (r.material && Array.isArray(r.material) && r.material.length > 0) {
    rawMat = r.material.join('\n');
  } else if (r.material && !Array.isArray(r.material) && String(r.material) !== 'undefined' && String(r.material).trim() !== '') {
    rawMat = String(r.material);
  } else {
    rawMat = 'Não informado';
  }

  const formatCards = (text) => {
    const safeText = String(text || '');
    if (!safeText || safeText.trim() === '' || safeText === 'Sem descrição' || safeText === 'Nenhum material especificado' || safeText === 'undefined') {
      return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">Não informado</p>`;
    }
    const steps = safeText.split(/\n/).map(s => s.trim().replace(/^[-–]/, '').trim()).filter(s => s.length > 1);
    if (steps.length === 0) return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">${safeText}</p>`;
    return steps.map((step, idx) => `
      <div style="background: var(--bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 0.75rem; display: flex; gap: 1rem; align-items: flex-start; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <span style="background: rgba(212, 175, 55, 0.15); color: var(--primary); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: bold; flex-shrink: 0; border: 1px solid rgba(212, 175, 55, 0.3);">${idx + 1}</span>
        <span style="font-size: 0.95rem; line-height: 1.5; color: var(--text); padding-top: 2px;">${step}</span>
      </div>
    `).join('');
  };

  const descHTML = formatCards(desc);
  const matHTML = formatCards(rawMat);

  document.getElementById('drillLista').innerHTML = `
    <article class="drill-item" style="padding:1.5rem;background:transparent;border:none;">
      <h4 style="margin-top:0;color:var(--text);margin-bottom:1rem;font-size:1.05rem;display:flex;align-items:center;gap:0.5rem;">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        Descrição da Atividade
      </h4>
      ${descHTML}
      
      <h4 style="margin-top:2rem;color:var(--text);margin-bottom:1rem;font-size:1.05rem;display:flex;align-items:center;gap:0.5rem;">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
        Materiais Necessários
      </h4>
      ${matHTML}

      <div class="drill-item-actions" style="margin-top:2rem;">
        <button type="button" class="btn-primary" onclick="abrirFormularioPreventivaFE('${r.id}');fecharDrilldown();" style="width:100%;">✏️ Editar Atividade</button>
      </div>
    </article>`;
  panel.classList.add('open');
  overlay.classList.add('open');
};

// ==========================================
// GERADOR DE PLANOS — FRONT-END
// ==========================================
function setupPlanoPreventivaUIFrontend() {
  const machineSelect = $('#planoMachineSelectFE');
  const monthSelect = $('#planoMesSelectFE');
  const lineSelect = $('#planoLinhaSelectFE');
  const btnAplicar = $('#btnAplicarPlanoFE');
  const table = $('#planoActivitiesTableFE');
  const countEl = $('#planoAtividadesCountFE');

  if (!machineSelect || !btnAplicar || !table) return;

  let currentActivitiesFE = [];
  if (!window.editedPlanoItemsFE) window.editedPlanoItemsFE = new Set();

  const getContextoFE = () => ({
    maquina: machineSelect.value,
    mes: monthSelect.value,
    linha: lineSelect.value,
  });
  const contextoFECompleto = () => {
    const ctx = getContextoFE();
    return ctx.maquina && ctx.mes && ctx.linha;
  };

  const renderPlanoActivitiesTableFE = () => {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    if (!currentActivitiesFE.length) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:2rem;">Selecione uma máquina para carregar as atividades.</td></tr>';
      if (countEl) countEl.textContent = '';
      return;
    }
    tbody.innerHTML = currentActivitiesFE.map((a, i) => {
      const isEdited = window.editedPlanoItemsFE && window.editedPlanoItemsFE.has(a.id);
      return `<tr ondblclick="abrirFormularioPreventivaFE('${a.id}')" style="cursor:pointer; ${isEdited ? 'background-color: rgba(110,231,183,0.08); border-left: 3px solid #6ee7b7;' : ''}">
        <td style="position: relative;">${isEdited ? '<div class="floatFadeCard" style="border-color:#6ee7b7;color:#6ee7b7;box-shadow:0 0 10px rgba(110,231,183,0.3)">Salvo</div>' : ''}${i + 1}</td>
        <td>${a.maquina || '—'}</td>
        <td style="min-width:350px; white-space:normal; line-height:1.5; padding: 12px; color: var(--text);">${(a.atividades_descricoes ? a.atividades_descricoes.join('<br>') : a.descricao || '-')}</td>
        <td>${a.duracao_horas ?? '—'}</td>
        <td>${a.hh_mec || '—'}</td>
        <td>${a.hh_eletrico || '—'}</td>
        <td>${a.hh_lub || '—'}</td>
        <td>${a.frequencia_meses ? a.frequencia_meses + ' m' : '—'}</td>
        <td>${a.sugestao || a.resp_fabrica || '—'}</td>
        <td><span class="badge ${a.status_auditoria === 'FINALIZADO' ? 'badge-success' : a.status_auditoria ? 'badge-warning' : ''}">${a.status_auditoria || '—'}</span></td>
        <td><button type="button" class="btn-icon" onclick="abrirFormularioPreventivaFE('${a.id}')" title="Editar">✏️</button></td>
      </tr>`;
    }).join('');
    if (countEl) countEl.textContent = `${currentActivitiesFE.length} atividade(s)`;
  };

  const carregarAtividadesPlanoFE = () => {
    const ctx = getContextoFE();
    if (!ctx.maquina) { currentActivitiesFE = []; renderPlanoActivitiesTableFE(); return; }
    currentActivitiesFE = registrosPreventivaFrontend.filter(r =>
      r.maquina === ctx.maquina &&
      (!ctx.mes || !r.mes || r.mes === ctx.mes) &&
      (!ctx.linha || !r.linha || r.linha === ctx.linha)
    );
    if (!currentActivitiesFE.length) {
      currentActivitiesFE = registrosPreventivaFrontend.filter(r => r.maquina === ctx.maquina);
    }
    renderPlanoActivitiesTableFE();
    if (btnAplicar) btnAplicar.disabled = !contextoFECompleto() || currentActivitiesFE.length === 0;
  };

  const loadPlanoMachinesFE = () => {
    let maquinas = [...new Set(registrosPreventivaFrontend.map(r => r.maquina).filter(Boolean))].sort();
    if (!maquinas.length) maquinas = ['ESMALTADEIRA', 'IMPRESSORA', 'VERNIZ EXTERNO', 'DECORAÇÃO', 'CONIFICADORA', 'EMBALADEIRA'];
    machineSelect.innerHTML = '<option value="">Selecione a máquina...</option>' +
      maquinas.map(m => `<option value="${m}">${m}</option>`).join('');
  };
  loadPlanoMachinesFE();

  [machineSelect, monthSelect, lineSelect].forEach(el => el?.addEventListener('change', carregarAtividadesPlanoFE));
  window.carregarAtividadesPlanoFE = carregarAtividadesPlanoFE;

  btnAplicar?.addEventListener('click', async () => {
    const ctx = getContextoFE();
    if (!contextoFECompleto()) { toast('Selecione máquina, mês e linha antes de aplicar.', 'warning'); return; }
    if (!currentActivitiesFE.length) { toast('Nenhuma atividade no plano Front-end.', 'warning'); return; }
    const confirm = await Swal.fire({
      title: 'Aplicar Plano Front-end',
      html: `<p>Serão <strong>substituídos</strong> os registros Front-end de:</p>
        <ul style="text-align:left;margin:1rem 0;padding-left:1.25rem;line-height:1.6;">
          <li><strong>Máquina:</strong> ${ctx.maquina}</li>
          <li><strong>Mês:</strong> ${ctx.mes}</li>
          <li><strong>Linha:</strong> ${ctx.linha}</li>
        </ul>
        <p><strong>${currentActivitiesFE.length}</strong> atividade(s) serão gravadas com <span style="color:#6ee7b7;">setor = frontend</span>.</p>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sim, aplicar Front-end', cancelButtonText: 'Cancelar',
      background: '#161f33', color: '#e2e8f0',
    });
    if (!confirm.isConfirmed) return;
    try {
      btnAplicar.disabled = true; btnAplicar.textContent = 'Aplicando...';
      const client = getClient();
      const { error: delErr } = await client.from('preventiva_registros').delete()
        .eq('setor', 'frontend').eq('maquina', ctx.maquina).eq('mes', ctx.mes).eq('linha', ctx.linha);
      if (delErr) throw delErr;
      const records = currentActivitiesFE.map(a => ({
        identificador: a.identificador || '',
        maquina: ctx.maquina,
        atividades_descricoes: a.atividades_descricoes || [],
        material: [], plano_padrao: 'S',
        mes: ctx.mes, linha: ctx.linha,
        duracao_horas: a.duracao_horas || 0,
        hh_mec: a.hh_mec || 0, hh_eletrico: a.hh_eletrico || 0, hh_lub: a.hh_lub || 0,
        frequencia_meses: a.frequencia_meses || null,
        sugestao: a.sugestao || a.resp_fabrica || '',
        resp_fabrica: a.sugestao || a.resp_fabrica || '',
        resp_manutencao: '', status_auditoria: '', previsao_custos: 0, programacao: [],
        setor: 'frontend', area_producao: 'FRONT-END',
      }));
      const { error: insErr } = await client.from('preventiva_registros').insert(records);
      if (insErr) throw insErr;
      toast(`✅ ${records.length} atividades Front-end aplicadas em ${ctx.mes} · ${ctx.linha} · ${ctx.maquina}`, 'success');
      const todos = await carregarPreventiva();
      registrosPreventivaFrontend = todos.filter(r => r.setor === 'frontend');
      registrosPreventiva = todos.filter(r => r.setor !== 'frontend');
      carregarAtividadesPlanoFE();
    } catch (err) {
      toast('Erro ao aplicar plano Front-end: ' + err.message, 'error');
    } finally {
      btnAplicar.disabled = !contextoFECompleto() || currentActivitiesFE.length === 0;
      btnAplicar.textContent = '✔️ Aplicar Plano ao Front-end';
      if (window.editedPlanoItemsFE) window.editedPlanoItemsFE.clear();
      renderPlanoActivitiesTableFE();
    }
  });

  renderPlanoActivitiesTableFE();

  window._refreshPlanoPreventivaFrontend = () => {
    loadPlanoMachinesFE();
    carregarAtividadesPlanoFE();
  };
}

onAuthStateChange((user) => {
  if (user) {
    document.getElementById('login-container').style.display = 'none';
    
    // Atualizar saudação
    const greetingEl = document.getElementById('userGreeting');
    if (greetingEl) {
      const hora = new Date().getHours();
      let saudacao = 'Bom dia';
      if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
      else if (hora >= 18) saudacao = 'Boa noite';
      
      const nomeUsuario = user.user_metadata?.username || user.email?.split('@')[0] || 'Usuário';
      greetingEl.textContent = `${saudacao}, ${nomeUsuario}!`;
      window.currentUser = { id: user.id, email: user.email, username: user.user_metadata?.username || nomeUsuario };
    }

    document.getElementById('app-container').style.display = 'flex';
    if (!isAppInitialized) {
      isAppInitialized = true;
      init().then(() => {
        initCalendario(registros);
        // Inicializar módulos de IA
        initAlertas();
        initCopiloto();
        initIndicadores();
        // Sininho de alertas
        document.getElementById('btnAlertaBell')?.addEventListener('click', toggleAlertasPanel);
        
        // --- Notificações de Prazos por Usuário ---
        checkPrazosAlerts();
      });
    }
  } else {
    isAppInitialized = false;
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }
});

// Lightbox genérico (expansão de imagem)
const openLightbox = (src) => {
  if (!src) return;
  const lb = document.getElementById('lightboxOverlay');
  const lbImg = document.getElementById('lightboxImg');
  if (lb && lbImg) {
    lbImg.src = src;
    lb.classList.add('open');
  }
};

document.getElementById('fotoPreviewWrap')?.addEventListener('click', () => {
  const preview = document.getElementById('fotoPreview');
  if (preview && preview.src && preview.src !== window.location.href) {
    openLightbox(preview.src);
  }
});

document.getElementById('lightboxOverlay')?.addEventListener('click', () => {
  const lb = document.getElementById('lightboxOverlay');
  const lbImg = document.getElementById('lightboxImg');
  if (lb) lb.classList.remove('open');
  if (lbImg) lbImg.src = '';
});

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('drill-foto-img')) {
    openLightbox(e.target.src);
  }

  // Lógica para o botão "Ver detalhes" das action bars da Preventiva
  if (e.target.closest('.btn-detalhes-prev')) {
    const bar = e.target.closest('.row-action-bar');
    if (bar) {
      // Find the closest wrapper (view, or table-scroll-main, or rl05-wrapper)
      let view = bar.closest('.view') || bar.closest('#view-planos-manutencao-frontend') || bar.parentElement;
      if (view) {
        const selectedTr = view.querySelector('tbody tr.row-selected');
        if (selectedTr) {
          const btnViewDetails = selectedTr.querySelector('button[title="Ver Detalhes"]') || selectedTr.querySelector('button[title="Ver detalhes"]');
          if (btnViewDetails) {
            btnViewDetails.click();
          } else {
            selectedTr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          }
        }
      }
    }
    return;
  }

  // Seleção de linha para as tabelas do módulo Preventiva
  const trPreventiva = e.target.closest('#view-planos-manutencao tbody tr, #view-planos-manutencao-frontend tbody tr, #view-plano-preventiva tbody tr, #view-plano-preventiva-frontend tbody tr, #view-por-maquina tbody tr');
  if (trPreventiva && !trPreventiva.querySelector('td.empty')) {
    const tbody = trPreventiva.closest('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(sib => sib.classList.remove('row-selected'));
      trPreventiva.classList.add('row-selected');

      const view = trPreventiva.closest('.view');
      if (view) {
        let barId, labelId;
        if (view.id === 'view-planos-manutencao') { barId = 'rowActionBarPrev'; labelId = 'rowActionLabelPrev'; }
        else if (view.id === 'view-planos-manutencao-frontend') { barId = 'rowActionBarPrevFE'; labelId = 'rowActionLabelPrevFE'; }
        else if (view.id === 'view-plano-preventiva') { barId = 'rowActionBarGerador'; labelId = 'rowActionLabelGerador'; }
        else if (view.id === 'view-plano-preventiva-frontend') { barId = 'rowActionBarGeradorFE'; labelId = 'rowActionLabelGeradorFE'; }
        
        if (barId) {
          // Ocultar as outras
          ['rowActionBarPrev', 'rowActionBarPrevFE', 'rowActionBarGerador', 'rowActionBarGeradorFE'].forEach(id => {
            if (id !== barId && document.getElementById(id)) document.getElementById(id).classList.add('hidden');
          });
          
          const bar = document.getElementById(barId);
          const label = document.getElementById(labelId);
          if (bar && label) {
            bar.classList.remove('hidden');
            const tds = Array.from(trPreventiva.querySelectorAll('td'));
            if (tds.length >= 2) {
              const text1 = tds[0].textContent.trim();
              const text2 = tds[1].textContent.trim();
              label.textContent = `Linha Selecionada: ${text1} ${text2 ? '- ' + text2 : ''}`;
            } else {
              label.textContent = 'Linha Selecionada';
            }
          }
        }
      }
    }
  }
});

// Função auxiliar temporária para o usuário migrar do Excel para o Supabase
window.migrarPlanilhaParaSupabase = async function() {
  const db = await import('./db.js');
  let maquinasPrev = opcoesUnicas(registrosPreventiva, 'maquina');
  maquinasPrev = maquinasPrev.filter(m => !['FRONTEND', 'GERAL', 'MAQUINA'].includes(m.toUpperCase()));
  const maquinasArray = Array.from(new Set([...maquinasPrev])).sort();
  
  if (maquinasArray.length === 0) {
    console.error('Planilha ainda não carregada! Por favor, aguarde o carregamento ou importe o Excel primeiro.');
    return;
  }
  
  console.log('Iniciando migração de ' + maquinasArray.length + ' máquinas...');
  for (const m of maquinasArray) {
    const activities = registrosPreventiva.filter(r => r.maquina === m);
    const seen = new Set();
    let index = 1;
    for (const a of activities) {
      const descText = (a.atividades_descricoes && a.atividades_descricoes.length > 0) 
          ? a.atividades_descricoes.join('\\n').trim() 
          : '';
      const ident = a.identificador || `Atv-${index}`;
      const uniqueKey = ident + '_' + descText;
      
      if (descText && !seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        try {
          await db.createMachineActivity(m, {
            ordem: index++,
            identificador: ident,
            plano_padrao: a.plano_padrao || 'S',
            duracao_horas: parseFloat(a.duracao_horas) || 0,
            hh_mec: parseFloat(a.hh_mec) || 0,
            hh_eletrico: parseFloat(a.hh_eletrico) || 0,
            resp_fabrica: a.resp_fabrica || '',
            resp_manutencao: a.resp_manutencao || '',
            previsao_custos: parseFloat(a.previsao_custos) || 0,
            status_auditoria: a.status_auditoria || 'PADRÃO',
            material: Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : [])
          });
        } catch(e) {
          console.error(`Erro na atividade da máquina ${m}:`, e.message);
        }
      }
    }
  }
  console.log('MIGRAÇÃO FINALIZADA COM SUCESSO! Você já pode dar F5 na página e usar a tela normalmente.');
};


// Drag to scroll
function initDragToScroll() {
  const sliders = document.querySelectorAll('.table-scroll-inner');
  sliders.forEach(slider => {
    let isDown = false;
    let startX;
    let scrollLeft;

    const onMouseMove = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 1.5; 
      slider.scrollLeft = scrollLeft - walk;
    };

    const onMouseUp = () => {
      isDown = false;
      slider.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    slider.addEventListener('mousedown', (e) => {
      // Prevent drag if clicking on the native horizontal scrollbar
      if (e.target === slider && e.offsetY >= slider.clientHeight) return;
      
      isDown = true;
      slider.style.cursor = 'grabbing';
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;

      // Attach events to window so dragging continues even if mouse leaves the table
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
    
    slider.addEventListener('mouseleave', () => {
      if (!isDown) {
        slider.style.cursor = 'default';
      }
    });
    
    slider.addEventListener('mousemove', (e) => {
      if (!isDown) {
        // Change cursor to grab only if not hovering the scrollbar
        const isScrollbar = e.target === slider && e.offsetY >= slider.clientHeight;
        const newCursor = isScrollbar ? 'default' : 'grab';
        if (slider.style.cursor !== newCursor) {
          slider.style.cursor = newCursor;
        }
      }
    });
  });
}


// Inicializar na carga inicial
document.addEventListener('DOMContentLoaded', initDragToScroll);
// Como script type module o DOM já pode estar pronto
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initDragToScroll, 100);
}

/* ===================================================
   THEME TOGGLE — Modo Claro / Escuro
   =================================================== */
(function initThemeToggle() {
  const STORAGE_KEY = 'cc-theme';
  const btn = document.getElementById('btnToggleTheme');

  function applyTheme(isLight) {
    document.body.classList.toggle('light-mode', isLight);
    const icon = btn?.querySelector('.theme-icon');
    const label = btn?.querySelector('.theme-label');
    // Mostra o modo que será ativado ao clicar (o oposto do atual)
    if (icon) icon.textContent = isLight ? '🌙' : '☀️';
    if (label) label.textContent = isLight ? 'Modo Escuro' : 'Modo Claro';
    localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
  }

  // Restaurar preferência salva
  const saved = localStorage.getItem(STORAGE_KEY);
  const preferLight = saved ? saved === 'light' : false;
  applyTheme(preferLight);

  if (btn) {
    btn.addEventListener('click', () => {
      const isNowLight = !document.body.classList.contains('light-mode');
      applyTheme(isNowLight);
    });
  }
})();

window.importarMaquinaExcel = async function() {
  const result = await Swal.fire({
    title: 'Importar Excel',
    text: 'Qual base de dados de Planos Preventivos você deseja atualizar?',
    icon: 'question',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Back-end',
    denyButtonText: 'Front-end',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#38bdf8',
    denyButtonColor: '#6ee7b7',
    background: '#161f33',
    color: '#f8fafc',
    customClass: {
      popup: 'border border-[rgba(255,255,255,0.1)] rounded-xl',
      confirmButton: 'btn btn-primary',
      denyButton: 'btn btn-primary',
      cancelButton: 'btn btn-ghost'
    }
  });

  if (result.isConfirmed) {
    document.getElementById('btnImportarPreventivaOnly')?.click();
  } else if (result.isDenied) {
    document.getElementById('btnImportarPreventivaSomenteFE')?.click();
  }
};

window.exportarMaquinaExcel = function() {
  const table = document.getElementById('machineActivitiesTable');
  if (!table || table.querySelector('tbody').rows.length === 0 || table.querySelector('tbody td').colSpan > 1) {
    toast('Não há dados para exportar.', 'warning');
    return;
  }
  
  if (typeof ExcelJS === 'undefined') {
    toast('Biblioteca ExcelJS não carregada. Atualize a página.', 'error');
    return;
  }
  
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Máquinas & Templates');
  
  const thead = table.querySelector('thead tr');
  const cols = Array.from(thead.querySelectorAll('th')).map(th => th.innerText).filter(t => t !== '');
  
  const headerRow = ws.addRow(cols);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;
  
  const tbody = table.querySelector('tbody');
  Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
    const tds = Array.from(tr.querySelectorAll('td'));
    if (tds.length < cols.length) return;
    
    const rowData = [];
    for(let i=0; i<cols.length; i++) {
      rowData.push(tds[i].innerText.replace(/\n/g, ' '));
    }
    const wsRow = ws.addRow(rowData);
    wsRow.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  });
  
  ws.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const colLength = cell.value ? cell.value.toString().length : 10;
      if (colLength > maxLength) maxLength = colLength;
    });
    column.width = Math.min(maxLength + 2, 50);
  });
  
  const titulo = document.getElementById('machineTitle').innerText.replace(/\s+/g, '_');
  
  wb.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${titulo}_${new Date().toISOString().slice(0,10)}.xlsx`;
    link.click();
  });
};

window.renderMachineList = renderMachineList;

function preencherDatalistFornecedoresContatos() {
  const datalist = $('#listaContatosFornecedores');
  if (!datalist) return;
  const names = new Set();
  registros.forEach(r => { if(r.fornecedor) names.add(r.fornecedor.toUpperCase()); });
  if(window.fornecedoresContatosData) {
    window.fornecedoresContatosData.forEach(c => { if(c.fornecedor_nome) names.add(c.fornecedor_nome.toUpperCase()); });
  }
  datalist.innerHTML = Array.from(names).sort().map(n => `<option value="${n}"></option>`).join('');
}

$('#contatoFornecedorNome')?.addEventListener('change', (e) => {
  const val = e.target.value.trim().toUpperCase();
  const contato = window.fornecedoresContatosData.find(c => c.fornecedor_nome.toUpperCase() === val);
  if(contato) {
    $('#contatoEmail').value = contato.email || '';
    $('#contatoTelefone').value = contato.telefone || '';
    $('#contatoMensagem').value = contato.mensagem_padrao || '';
  } else {
    $('#contatoEmail').value = '';
    $('#contatoTelefone').value = '';
    $('#contatoMensagem').value = '';
  }
});

$('#formContatoFornecedor')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    fornecedor_nome: $('#contatoFornecedorNome').value.trim().toUpperCase(),
    email: $('#contatoEmail').value.trim(),
    telefone: $('#contatoTelefone').value.trim(),
    mensagem_padrao: $('#contatoMensagem').value.trim()
  };
  try {
    const salvo = await upsertFornecedorContato(payload);
    const idx = window.fornecedoresContatosData.findIndex(c => c.fornecedor_nome === salvo.fornecedor_nome);
    if(idx >= 0) window.fornecedoresContatosData[idx] = salvo;
    else window.fornecedoresContatosData.push(salvo);
    toast('Contato do fornecedor salvo com sucesso!', 'success');
    $('#modalFornecedorContato').classList.remove('open');
  } catch(err) {
    toast('Erro ao salvar contato: ' + err.message, 'error');
  }
});


// ==========================================
// LÓGICA DE CONTATOS DE FORNECEDORES
// ==========================================
window.fornecedoresContatosData = [];

async function carregarFornecedoresContatos() {
  try {
    const { data, error } = await getClient().from('fornecedores_contatos').select('*');
    if (error) throw error;
    window.fornecedoresContatosData = data || [];
  } catch (err) {
    console.error('Erro ao carregar contatos:', err);
  }
}

document.getElementById('btnConfigContatos')?.addEventListener('click', async () => {
  const modal = document.getElementById('modalFornecedorContato');
  const select = document.getElementById('contatoFornecedorNome');
  
  // Extrair fornecedores únicos usando as variáveis globais do app
  const uniqueForns = [...new Set(registros.map(r => r.fornecedor).filter(Boolean))].sort();
  
  select.innerHTML = '<option value="">Selecione o fornecedor...</option>';
  uniqueForns.forEach(f => {
    const fSafe = f.replace(/"/g, '&quot;');
    select.innerHTML += `<option value="${fSafe}">${f}</option>`;
  });
  
  await carregarFornecedoresContatos();
  modal.classList.add('open');
});

document.getElementById('contatoFornecedorNome')?.addEventListener('change', (e) => {
  const f = e.target.value;
  const c = window.fornecedoresContatosData.find(x => x.fornecedor_nome === f);
  if (c) {
    document.getElementById('contatoEmail').value = c.email || '';
    document.getElementById('contatoTelefone').value = c.telefone || '';
    const defMsg = 'Olá, bom dia! Tudo bem?\n\nSegue abaixo itens para verificação de atraso.';
    document.getElementById('contatoMensagem').value = c.mensagem_padrao || defMsg;
  } else {
    const defMsg = 'Olá, bom dia! Tudo bem?\n\nSegue abaixo itens para verificação de atraso.';
    document.getElementById('contatoEmail').value = '';
    document.getElementById('contatoTelefone').value = '';
    document.getElementById('contatoMensagem').value = defMsg;
  }
});

document.getElementById('formContatoFornecedor')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const fNome = document.getElementById('contatoFornecedorNome').value;
  const obj = {
    fornecedor_nome: fNome,
    email: document.getElementById('contatoEmail').value,
    telefone: document.getElementById('contatoTelefone').value,
    mensagem_padrao: document.getElementById('contatoMensagem').value
  };

  try {
    const { data: exist } = await getClient().from('fornecedores_contatos').select('id').eq('fornecedor_nome', fNome).maybeSingle();
    if (exist) {
      await getClient().from('fornecedores_contatos').update(obj).eq('id', exist.id);
    } else {
      await getClient().from('fornecedores_contatos').insert([obj]);
    }
    toast('Contato salvo com sucesso!');
    await carregarFornecedoresContatos();
    document.getElementById('modalFornecedorContato').classList.remove('open');
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar contato', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar Contato';
  }
});

// Chamar ao carregar a página para os botões do SLA
document.addEventListener('DOMContentLoaded', carregarFornecedoresContatos);

// ==========================================
// CALENDÁRIO CHECK-IN DE PREVENTIVA
// ==========================================
let checkinsPreventiva = [];

async function carregarCheckinsPreventiva(mes) {
  if (!mes) return;
  try {
    const { data, error } = await getClient()
      .from('preventiva_linhas_checkin')
      .select('*')
      .eq('mes', mes);
    if (!error && data) {
      checkinsPreventiva = [];
      data.forEach(d => {
        let val = Number(d.dia);
        if (val < 0) {
          // Bitmask invertido
          let mask = -val;
          for (let i = 0; i < 31; i++) {
            if ((mask & (1 << i)) !== 0) {
              checkinsPreventiva.push({ linha: d.linha, dia: i + 1 });
            }
          }
        } else if (val > 0) {
          // Legado
          checkinsPreventiva.push({ linha: d.linha, dia: val });
        }
      });
    } else {
      checkinsPreventiva = [];
    }
  } catch (err) {
    console.error(err);
    checkinsPreventiva = [];
  }
}

async function salvarDiaLinhaPreventiva(mes, linha, diaStr) {
  const novoDia = parseInt(diaStr);
  const isAdding = !isNaN(novoDia) && novoDia >= 1 && novoDia <= 31;
  
  try {
    // 1. Pegar dias atuais
    let diasGravados = checkinsPreventiva.filter(c => c.linha === linha).map(c => c.dia).sort((a,b)=>a-b);
    
    if (!isAdding) {
      // 2. Remover o maior dia se clicou no X
      if (diasGravados.length > 0) {
        const removido = diasGravados.pop();
        toast(`Dia ${removido} removido.`, 'info');
      }
    } else {
      // 3. Adicionar o novo dia se não existir
      if (!diasGravados.includes(novoDia)) {
        diasGravados.push(novoDia);
        diasGravados.sort((a,b)=>a-b);
        toast(`Dia ${novoDia} adicionado.`, 'success');
      }
    }

    // 4. Calcular o novo valor para o BD
    await getClient().from('preventiva_linhas_checkin').delete().match({ mes, linha });
    
    if (diasGravados.length > 0) {
      let bitmask = 0;
      for (let d of diasGravados) {
        bitmask |= (1 << (d - 1));
      }
      let diaDb = -bitmask; // Salva como número negativo para indicar bitmask
      const { error } = await getClient().from('preventiva_linhas_checkin').insert([{ mes, linha, dia: diaDb }]);
      if (error) throw error;
    }

    // 5. Atualizar estado local
    checkinsPreventiva = checkinsPreventiva.filter(c => c.linha !== linha);
    for (let d of diasGravados) {
      checkinsPreventiva.push({ linha, dia: d });
    }

    // 6. Atualizar UI
    document.querySelectorAll(`.preventiva-dia-input[data-linha="${linha}"]`).forEach(el => el.value = '');
    
    const labelText = diasGravados.length > 0 ? `Dias: ${diasGravados.join(', ')}` : '';
    const lblBe = document.getElementById(`dias-label-${linha}`);
    if (lblBe) lblBe.textContent = labelText;
    const lblFe = document.getElementById(`dias-label-fe-${linha}`);
    if (lblFe) lblFe.textContent = labelText;

    renderCalendarioPreventiva(mes, false);
    renderCalendarioPreventiva(mes, true);
  } catch(err) {
    console.error(err);
    toast('Erro ao atualizar dia.', 'error');
  }
}
window.salvarDiaLinhaPreventiva = salvarDiaLinhaPreventiva;

// ==========================================
// EXPORTAÇÃO PDF DO CALENDÁRIO
// ==========================================
function exportarRelatorioCheckins() {
  const mes = estadoPlanos.mes || estadoPlanosFrontend.mes || new Date().toLocaleString('pt-BR', {month: 'long'}).toUpperCase();
  
  if (!checkinsPreventiva || checkinsPreventiva.length === 0) {
    toast('Não há preventivas marcadas para gerar relatório.', 'warning');
    return;
  }

  const linhasUnicas = [...new Set(checkinsPreventiva.map(c => c.linha))].sort();
  const totalIntervencoes = checkinsPreventiva.length;
  
  const diasCount = {};
  checkinsPreventiva.forEach(c => {
    diasCount[c.dia] = (diasCount[c.dia] || 0) + 1;
  });
  let peakDay = '-';
  let maxInterv = 0;
  for (const d in diasCount) {
    if (diasCount[d] > maxInterv) {
      maxInterv = diasCount[d];
      peakDay = d;
    }
  }
  const peakDayText = maxInterv > 0 ? `Dia ${peakDay}` : '-';

  const el = document.createElement('div');
  // Formato A4 corporativo em pixels (aprox 794px width).
  el.style.width = '710px';
  el.style.backgroundColor = '#ffffff'; 
  el.style.color = '#333333';
  el.style.fontFamily = 'Arial, sans-serif'; // Fontes padrão de sistema corporativo
  el.style.boxSizing = 'border-box';
  
  // HTML do PDF
  let html = `
    <div style="padding: 10px; background-color: #ffffff; display: flex; flex-direction: column;">
      
      <!-- CABEÇALHO CORPORATIVO -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #10b981; padding-bottom: 15px; margin-bottom: 30px;">
        <div>
          <h1 style="margin: 0; font-size: 26px; color: #111827; font-weight: 800; letter-spacing: -0.5px;">RELATÓRIO GERENCIAL</h1>
          <h2 style="margin: 5px 0 0 0; font-size: 16px; font-weight: 500; color: #4b5563; text-transform: uppercase;">Manutenção Preventiva - Check-ins</h2>
        </div>
        <div style="text-align: right;">
          <h3 style="margin: 0; font-size: 18px; color: #10b981; font-weight: bold;">MÊS REFERÊNCIA: ${mes.toUpperCase()}</h3>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #6b7280;">Documento gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">SISTEMA CONTROLE RC</p>
        </div>
      </div>

      <!-- RESUMO EXECUTIVO -->
      <h3 style="font-size: 14px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; text-transform: uppercase;">1. Resumo Executivo</h3>
      <div style="display: flex; gap: 15px; margin-bottom: 35px;">
        <div style="flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Total de Intervenções</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${totalIntervencoes}</p>
        </div>
        <div style="flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Linhas Atendidas</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${linhasUnicas.length}</p>
        </div>
        <div style="flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Pico de Manutenção</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${peakDayText}</p>
        </div>
      </div>

      <!-- TABELA ANALÍTICA -->
      <h3 style="font-size: 14px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; text-transform: uppercase;">2. Detalhamento por Linha de Produção</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 10px 12px; border: 1px solid #d1d5db; color: #374151; width: 30%;">LINHA DE PRODUÇÃO</th>
            <th style="text-align: left; padding: 10px 12px; border: 1px solid #d1d5db; color: #374151; width: 55%;">DIAS EXECUTADOS</th>
            <th style="text-align: center; padding: 10px 12px; border: 1px solid #d1d5db; color: #374151; width: 15%;">QTD DIAS</th>
          </tr>
        </thead>
        <tbody>
  `;

  linhasUnicas.forEach((l, index) => {
    const dias = checkinsPreventiva.filter(c => c.linha === l).map(c => c.dia).sort((a,b) => a - b);
    const bgClass = index % 2 === 0 ? '#ffffff' : '#f9fafb';
    const diasFormatados = dias.map(d => `<span style="display:inline-block; border: 1px solid #10b981; background:#ecfdf5; color:#065f46; padding:2px 6px; border-radius:4px; margin: 2px; font-weight:600; font-size: 11px;">Dia ${d}</span>`).join('');
    
    html += `
      <tr style="background-color: ${bgClass};">
        <td style="padding: 10px 12px; border: 1px solid #d1d5db; font-weight: bold; color: #1f2937;">Linha ${l.replace('L','')}</td>
        <td style="padding: 10px 12px; border: 1px solid #d1d5db;">${diasFormatados}</td>
        <td style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; font-weight: 600;">${dias.length}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
  `;

  // MAPA VISUAL DO MÊS (CALENDÁRIO CLEAR)
  html += `
      <h3 style="font-size: 14px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; text-transform: uppercase; page-break-before: auto;">3. Mapa Visual do Mês</h3>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px; border-radius: 6px; margin-bottom: auto;">
  `;

  const anoStr = new Date().getFullYear();
  const mesesArr = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  let monthIdx = mesesArr.indexOf(mes.toUpperCase());
  if (monthIdx === -1) monthIdx = new Date().getMonth();
  const diasNoMes = new Date(anoStr, monthIdx + 1, 0).getDate();
  const primeiroDiaSemana = new Date(anoStr, monthIdx, 1).getDay();

  const diasDaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  diasDaSemana.forEach(d => {
    html += `<div style="text-align: center; font-size: 11px; color: #4b5563; font-weight: bold; padding: 4px 0;">${d}</div>`;
  });

  for (let empty = 0; empty < primeiroDiaSemana; empty++) {
    html += `<div></div>`;
  }

  for (let i = 1; i <= diasNoMes; i++) {
    const linesOnThisDay = checkinsPreventiva.filter(c => c.dia === i).map(c => c.linha.replace('L',''));
    const isChecked = linesOnThisDay.length > 0;
    const bg = isChecked ? '#10b981' : '#ffffff';
    const color = isChecked ? '#ffffff' : '#6b7280';
    const border = isChecked ? '1px solid #059669' : '1px solid #e5e7eb';
    
    html += `
      <div style="background: ${bg}; color: ${color}; border: ${border}; border-radius: 4px; padding: 6px 2px; text-align: center; font-size: 13px; font-weight: ${isChecked ? 'bold' : 'normal'}; min-height: 40px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        ${i}
        ${isChecked ? `<span style="font-size: 9px; font-weight: normal; margin-top: 2px;">${linesOnThisDay.length} interv.</span>` : ''}
      </div>
    `;
  }
  
  html += `</div>`; // Fim Grid

  // RODAPÉ / ASSINATURAS
  html += `
      <div style="margin-top: 50px; display: flex; justify-content: space-around; padding-top: 30px;">
        <div style="text-align: center; width: 40%;">
          <div style="border-top: 1px solid #374151; padding-top: 10px;">
            <p style="margin: 0; font-size: 12px; font-weight: bold; color: #111827;">Responsável Técnico / Planejamento</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Assinatura</p>
          </div>
        </div>
        <div style="text-align: center; width: 40%;">
          <div style="border-top: 1px solid #374151; padding-top: 10px;">
            <p style="margin: 0; font-size: 12px; font-weight: bold; color: #111827;">Gerência de Manutenção</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Aprovação</p>
          </div>
        </div>
      </div>
    </div>
  `;

  el.innerHTML = html;
  
  const opt = {
    margin:       10,
    filename:     `Relatorio_Gerencial_Preventivas_${mes}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  document.body.appendChild(el);
  
  if (typeof html2pdf === 'undefined') {
    toast('Biblioteca PDF não carregada', 'error');
    document.body.removeChild(el);
    return;
  }
  
  toast('Gerando documento corporativo. Aguarde...', 'info');
  html2pdf().set(opt).from(el).save().then(() => {
    document.body.removeChild(el);
    toast('Relatório Corporativo exportado!', 'success');
  }).catch(err => {
    console.error(err);
    document.body.removeChild(el);
    toast('Erro ao gerar PDF.', 'error');
  });
}
window.exportarRelatorioCheckins = exportarRelatorioCheckins;



function renderCalendarioPreventiva(mes, isFrontend = false) {
  const containerId = isFrontend ? 'preventiva-checkin-grid-fe' : 'preventiva-checkin-grid';
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const anoStr = new Date().getFullYear();
  const mesesArr = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  let monthIdx = mesesArr.indexOf(mes.toUpperCase());
  if (monthIdx === -1) monthIdx = new Date().getMonth();
  
  const diasNoMes = new Date(anoStr, monthIdx + 1, 0).getDate();
  const primeiroDiaSemana = new Date(anoStr, monthIdx, 1).getDay();
  
  let html = '';
  
  const diasDaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  diasDaSemana.forEach(d => {
    html += `<div style="text-align: center; font-size: 0.75rem; color: var(--muted); font-weight: 600; text-transform: uppercase; padding-bottom: 0.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.25rem;">${d}</div>`;
  });

  for (let empty = 0; empty < primeiroDiaSemana; empty++) {
    html += `<div style="visibility: hidden;"></div>`;
  }
  
  for (let i = 1; i <= diasNoMes; i++) {
    const linesOnThisDay = checkinsPreventiva.filter(c => c.dia === i).map(c => c.linha.replace('L',''));
    const isChecked = linesOnThisDay.length > 0;
    
    const bg = isChecked ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.2) 100%)' : 'var(--surface)';
    const color = isChecked ? '#10b981' : 'var(--text)';
    const border = isChecked ? '1px solid rgba(16, 185, 129, 0.5)' : '1px dashed rgba(255,255,255,0.05)';
    const shadow = isChecked ? 'box-shadow: inset 0 0 0 1px rgba(16,185,129,0.1);' : '';
    
    let subHtml = '';
    if (isChecked) {
       subHtml = `<div style="display:flex; gap:2px; margin-top:2px; flex-wrap:wrap; justify-content:center; padding: 0 2px;">
         ${linesOnThisDay.map(l => `<span style="font-size:0.55rem; font-weight:bold; background:rgba(16,185,129,0.2); color:#10b981; padding:1px 3px; border-radius:3px;">L${l}</span>`).join('')}
       </div>`;
    }
    
    html += `
      <div style="
        background: ${bg};
        border: ${border};
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 70px;
        color: ${color};
        transition: all 0.3s ease;
        padding: 4px 2px;
        ${shadow}
      ">
        <span style="font-size: 0.9rem; font-weight: ${isChecked ? '600' : '400'}; margin-bottom: 2px;">${i}</span>
        ${subHtml}
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// =============================
// GESTÃO DE EQUIPE & DELEGAÇÃO DE TAREFAS
// =============================

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getTaskDuration(t) {
  if (t.status === 'PENDENTE') return '00:00:00';
  if (t.status === 'EM_ANDAMENTO') {
    if (!t.iniciado_em) return '00:00:00';
    return formatTime(new Date() - new Date(t.iniciado_em));
  }
  if (t.status === 'FINALIZADA') {
    if (!t.iniciado_em || !t.finalizado_em) return '00:00:00';
    return formatTime(new Date(t.finalizado_em) - new Date(t.iniciado_em));
  }
  return '00:00:00';
}

function getPupilosDisponiveis() {
  const currentUser = window.currentUser?.username;
  if (!currentUser) return pupilosDisponiveis;
  
  const myRole = usersHierarchy[currentUser]?.role;
  if (myRole === 'ADM') {
    // ADM can assign to anyone except themselves
    return Object.keys(usersHierarchy).filter(u => u !== currentUser);
  }
  // Masters can only assign to Pupils
  return pupilosDisponiveis;
}

function renderGestaoTarefas(onlyUpdateTimers = false) {
  const container = document.getElementById('dashboardGestaoTarefas');
  if (!container) return;

  // Render timers if only updating
  if (onlyUpdateTimers) {
    document.querySelectorAll('.task-timer').forEach(el => {
      const id = el.dataset.id;
      const t = tarefasDelegadas.find(x => x.id === id);
      if (t) el.textContent = getTaskDuration(t);
    });
    return;
  }

  const dynamicPupilos = getPupilosDisponiveis();

  // Generate HTML
  // Group by pupil
  const html = dynamicPupilos.map(pupil => {
    const tasks = tarefasDelegadas.filter(t => t.atribuido_para === pupil);
    
    return `
      <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.5rem;">
        <h3 style="margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">👤 ${pupil} <span class="badge badge-info">${tasks.length}</span></h3>
        ${tasks.length === 0 ? '<p style="color:var(--muted); font-size:0.9rem;">Nenhuma tarefa delegada.</p>' : ''}
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:1.25rem;">
          ${tasks.map(t => `
            <div style="background:var(--surface); border:1px solid ${t.status === 'EM_ANDAMENTO' ? 'var(--primary)' : 'var(--border)'}; border-radius:12px; padding:1.25rem; position:relative; overflow:hidden; transition: transform 0.2s;">
              ${t.status === 'EM_ANDAMENTO' ? '<div style="position:absolute; top:0; left:0; bottom:0; width:4px; background:var(--primary);"></div>' : ''}
              ${t.status === 'FINALIZADA' ? '<div style="position:absolute; top:0; left:0; bottom:0; width:4px; background:var(--success);"></div>' : ''}
              
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                <h4 style="margin:0; font-size:1.05rem; padding-right:80px; line-height:1.4;">${t.titulo}</h4>
                <span style="position:absolute; top:1.25rem; right:1.25rem;" class="badge ${t.status === 'FINALIZADA' ? 'badge-success' : t.status === 'EM_ANDAMENTO' ? 'badge-warning' : ''}">${t.status}</span>
              </div>
              
              <p style="color:var(--muted); font-size:0.85rem; margin-bottom:1.25rem; line-height:1.5; background:rgba(0,0,0,0.1); padding:0.75rem; border-radius:6px;">${t.descricao || '<span style="opacity:0.5;font-style:italic;">Sem detalhes adicionais</span>'}</p>
              
              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:1rem; font-size:0.8rem;">
                <div style="display:flex; flex-direction:column;">
                  <span style="color:var(--muted); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Delegado por</span>
                  <span style="color:var(--text); font-weight:500;">${t.atribuido_por}</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                  <span style="color:var(--muted); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Tempo</span>
                  <span style="font-family:monospace; font-size:1.2rem; color:${t.status === 'EM_ANDAMENTO' ? 'var(--primary)' : 'var(--text)'}; font-weight:bold;" class="task-timer" data-id="${t.id}">
                    ${getTaskDuration(t)}
                  </span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function renderMinhasTarefas(onlyUpdateTimers = false) {
  const container = document.getElementById('dashboardMinhasTarefas');
  if (!container) return;

  if (onlyUpdateTimers) {
    document.querySelectorAll('.my-task-timer').forEach(el => {
      const id = el.dataset.id;
      const t = tarefasDelegadas.find(x => x.id === id);
      if (t) el.textContent = getTaskDuration(t);
    });
    return;
  }

  const currentUser = window.currentUser?.username;
  if (!currentUser) {
    container.innerHTML = '<p>Usuário não identificado.</p>';
    return;
  }

  const myTasks = tarefasDelegadas.filter(t => t.atribuido_para === currentUser);
  if (myTasks.length === 0) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 60vh; text-align: center; color: var(--muted); margin: 0 auto; max-width: 600px; padding: 2rem;">
        <svg style="width: 64px; height: 64px; opacity: 0.3; margin-bottom: 1.5rem; color: var(--primary);" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1.75rem; color: var(--text); font-weight: 500; letter-spacing: -0.02em;">Tudo tranquilo por aqui!</h3>
        <p style="margin: 0; font-size: 1.05rem; line-height: 1.6; opacity: 0.8;">Você não tem tarefas atribuídas no momento.<br>Aproveite para tomar um café ou adiantar outras pendências.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:1.5rem;">
      ${myTasks.map(t => `
        <div style="background:var(--surface); border:1px solid ${t.status === 'EM_ANDAMENTO' ? 'var(--primary)' : 'var(--border)'}; border-radius:16px; padding:1.5rem; position:relative; overflow:hidden; box-shadow: ${t.status === 'EM_ANDAMENTO' ? '0 0 20px rgba(59,130,246,0.15)' : '0 4px 6px rgba(0,0,0,0.1)'}; transition: transform 0.2s;">
          ${t.status === 'EM_ANDAMENTO' ? '<div style="position:absolute; top:0; left:0; right:0; height:4px; background:var(--primary);"></div>' : ''}
          ${t.status === 'FINALIZADA' ? '<div style="position:absolute; top:0; left:0; right:0; height:4px; background:var(--success);"></div>' : ''}
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
            <div style="flex:1; padding-right:1rem;">
              <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); font-weight:600;">De: ${t.atribuido_por}</span>
              <h3 style="margin:0.25rem 0 0 0; font-size:1.15rem; color:var(--text); line-height:1.4;">${t.titulo}</h3>
            </div>
            <span class="badge ${t.status === 'FINALIZADA' ? 'badge-success' : t.status === 'EM_ANDAMENTO' ? 'badge-warning' : ''}">${t.status}</span>
          </div>
          
          <div style="background:rgba(0,0,0,0.15); border-radius:8px; padding:1rem; margin-bottom:1.5rem; border:1px solid rgba(255,255,255,0.05);">
            <p style="color:var(--text); font-size:0.9rem; margin:0; opacity:0.9; line-height:1.5;">${t.descricao || '<span style="color:var(--muted);font-style:italic;">Sem descrição detalhada.</span>'}</p>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; flex-direction:column;">
              <span style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.1em;">Ação Necessária</span>
              <span style="font-size:0.9rem; color:var(--text); font-weight:500;">
                ${t.status === 'PENDENTE' ? 'Aguardando Início' : t.status === 'EM_ANDAMENTO' ? 'Em Execução' : 'Atividade Entregue'}
              </span>
            </div>
            
            <div style="display:flex; gap:0.75rem;">
              ${t.status === 'PENDENTE' ? `<button class="btn" style="padding:0.5rem 1.25rem; font-weight:600;" onclick="window.iniciarTarefa('${t.id}')">▶ Iniciar</button>` : ''}
              ${t.status === 'EM_ANDAMENTO' ? `<button class="btn btn-outline" style="border-color:var(--success); color:var(--success); padding:0.5rem 1.25rem; font-weight:600;" onclick="window.finalizarTarefa('${t.id}')">✔ Finalizar</button>` : ''}
              ${t.status === 'FINALIZADA' ? `<span style="color:var(--success); font-weight:600; display:flex; align-items:center; gap:0.25rem;">✔ Concluído</span>` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.iniciarTarefa = async function(id) {
  try {
    await atualizarStatusTarefa(id, 'EM_ANDAMENTO', 'start');
    tarefasDelegadas = await getTarefasDelegadas();
    renderMinhasTarefas();
    renderGestaoTarefas();
    toast('Tarefa iniciada!', 'success');
  } catch(e) { toast('Erro ao iniciar tarefa: ' + e.message, 'error'); }
};

window.finalizarTarefa = async function(id) {
  try {
    await atualizarStatusTarefa(id, 'FINALIZADA', 'finish');
    tarefasDelegadas = await getTarefasDelegadas();
    renderMinhasTarefas();
    renderGestaoTarefas();
    toast('Tarefa finalizada com sucesso!', 'success');
  } catch(e) { toast('Erro ao finalizar tarefa: ' + e.message, 'error'); }
};

// Modal handlers
document.getElementById('btnNovaTarefaDelegada')?.addEventListener('click', () => {
  const modal = document.getElementById('modalNovaTarefaDelegada');
  const select = document.getElementById('ntdAtribuidoPara');
  if (select) {
    const dynamicPupilos = getPupilosDisponiveis();
    select.innerHTML = '<option value="">Selecione um usuário...</option>' + 
      dynamicPupilos.map(p => `<option value="${p}">${p}</option>`).join('');
  }
  modal?.classList.add('open');
});

document.getElementById('btnCancelarTarefaDelegada')?.addEventListener('click', () => {
  document.getElementById('modalNovaTarefaDelegada')?.classList.remove('open');
});

document.getElementById('formNovaTarefaDelegada')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = document.getElementById('ntdTitulo').value;
  const descricao = document.getElementById('ntdDescricao').value;
  const pupilo = document.getElementById('ntdAtribuidoPara').value;
  
  if (!titulo || !pupilo) return;
  
  try {
    const payload = {
      titulo,
      descricao,
      atribuido_para: pupilo,
      atribuido_por: window.currentUser?.username || 'Sistema',
      status: 'PENDENTE'
    };
    
    await criarTarefaDelegada(payload);
    tarefasDelegadas = await getTarefasDelegadas();
    renderGestaoTarefas();
    renderMinhasTarefas();
    
    document.getElementById('modalNovaTarefaDelegada')?.classList.remove('open');
    document.getElementById('formNovaTarefaDelegada').reset();
    toast('Tarefa delegada com sucesso!', 'success');
  } catch(err) {
    toast('Erro ao delegar tarefa: ' + err.message, 'error');
  }
});




document.getElementById('btnTogglePrivacy')?.addEventListener('click', () => {
  document.body.classList.toggle('privacy-mode');
  const isPrivacy = document.body.classList.contains('privacy-mode');
  const iconOpen = document.getElementById('iconPrivacyOpen');
  const iconClosed = document.getElementById('iconPrivacyClosed');
  if (iconOpen) iconOpen.style.display = isPrivacy ? 'none' : 'block';
  if (iconClosed) iconClosed.style.display = isPrivacy ? 'block' : 'none';
});

// ==========================================
// CUSTO GERAL (Integração Financeiro & Datasul)
// ==========================================

let chartEvolucaoCustoGeralInst = null;
let chartEstratificacaoCCIst = null;
let chartRadarTecnicosInst = null;

function renderTabelaCustoGeral() {
  console.log("renderTabelaCustoGeral CALLED!");
  const thead = $('#tabelaHeadCustoGeral');
  const tbody = $('#tabelaBodyCustoGeral');
  
  if (!thead || !tbody) {
    console.warn("thead or tbody not found!", {thead, tbody});
    return;
  }

  const modoColunas = $('#filtroModoColunasCustoGeral')?.value || 'todas';
  let colunasAtuais = COLUNAS_CUSTO_GERAL;
  if (modoColunas === 'resumo') {
    const permitidas = ['numero_ordem', 'solicitante', 'nome_solicitante', 'material', 'area'];
    colunasAtuais = COLUNAS_CUSTO_GERAL.filter(c => permitidas.includes(c.key));
  }

  thead.innerHTML = '<tr>' + colunasAtuais.map(c => `<th style="min-width:${c.width}px">${c.label}</th>`).join('') + '</tr>';
  console.log("thead rendered, columns:", colunasAtuais.length);

  const termoBusca = ($('#filtroBuscaCustoGeral')?.value || '').toLowerCase();
  const filtroOrdem = $('#filtroOrdemCustoGeral')?.value || 'todas';
  const filtroArea = $('#filtroAreaCustoGeral')?.value || 'todas';
  const filtroDataDe  = $('#filtroDataDeCustoGeral')?.value  || '';  // formato YYYY-MM-DD
  const filtroDataAte = $('#filtroDataAteCustoGeral')?.value || '';

  let budgetMetadata = null;
  let forecastMetadata = null;
  let dashboardData = null;
  let registrosReais = [];

  for (let r of (registrosCustoGeral || [])) {
    if (r.it_codigo === 'BUDGET_METADATA') {
      try { 
        budgetMetadata = JSON.parse(r.descricao_codigo); 
        window.budgetMetadata = budgetMetadata;
        if (budgetMetadata.responsaveis) {
          Object.keys(budgetMetadata.responsaveis).forEach(u => {
            if (usersHierarchy[u]) usersHierarchy[u].budget_areas = budgetMetadata.responsaveis[u];
          });
        }
      } catch(e){}
    } else if (r.it_codigo === 'FORECAST_METADATA') {
      try { forecastMetadata = JSON.parse(r.descricao_codigo); } catch(e){}
    } else if (r.it_codigo === 'DASHBOARD_METADATA') {
      try { 
        dashboardData = JSON.parse(r.descricao_codigo); 
        window.dashboardData = dashboardData;
      } catch(e){}
    } else {
      registrosReais.push(r);
    }
  }

  let registrosFiltrados = registrosReais.filter(r => {
    // Filtro de Ordem
    if (filtroOrdem === 'com_ordem' && !r.numero_ordem) return false;
    if (filtroOrdem === 'sem_ordem' && r.numero_ordem) return false;

    // Filtro de Simulação Excel
    if (filtroArea === 'manutencao_excel') {
      let checkStr = String(r.check || '').toLowerCase().trim();
      let isManut = checkStr.includes('manutenção') || checkStr.includes('manutencao');
      if (!isManut) return false;
      // Exclui os que o Excel perde porque a referência do PROCV quebrou (recuperados do Datasul)
      if (r.recuperado_datasul) return false;
    }

    // Filtro de Data (dt_trans)
    if (filtroDataDe || filtroDataAte) {
      // dt_trans pode vir como '2026-06-28', '28/06/2026' ou timestamp ISO
      let dtRaw = String(r.dt_trans || '');
      let dtParsed = null;
      if (/\d{4}-\d{2}-\d{2}/.test(dtRaw)) {
        dtParsed = dtRaw.substring(0, 10); // já está em YYYY-MM-DD
      } else if (/\d{2}\/\d{2}\/\d{4}/.test(dtRaw)) {
        const [d, m, y] = dtRaw.split('/');
        dtParsed = `${y}-${m}-${d}`;
      }
      if (dtParsed) {
        if (filtroDataDe  && dtParsed < filtroDataDe)  return false;
        if (filtroDataAte && dtParsed > filtroDataAte) return false;
      } else {
        // se não conseguiu parsear e há filtro de data, exclui o registro
        if (filtroDataDe || filtroDataAte) return false;
      }
    }

    // Busca textual
    if (!termoBusca) return true;
    const values = [r.numero_ordem, r.it_codigo, r.descricao_codigo, r.solicitante, r.nome_solicitante, r.area, r.linha, r.nro_docto, r.cc].map(v => String(v || '').toLowerCase());
    return values.some(v => v.includes(termoBusca));
  });

  // Ordenação Padrão: Número da Ordem do Menor para o Maior
  registrosFiltrados.sort((a, b) => {
    const ordA = Number(a.numero_ordem) || 0;
    const ordB = Number(b.numero_ordem) || 0;
    
    // Jogar ordens vazias (0) para o final da lista
    if (ordA === 0 && ordB !== 0) return 1;
    if (ordB === 0 && ordA !== 0) return -1;
    
    return ordA - ordB;
  });

  if (!registrosFiltrados || registrosFiltrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colunasAtuais.length}" class="empty">Nenhum registro de custo geral encontrado.</td></tr>`;
    ['kpiManutencao', 'kpiFerramentaria', 'kpiFacilities', 'kpiCustoMes'].forEach(id => {
      if ($(id)) $(id).textContent = 'R$ 0,00';
    });
    return;
  }

  let totalMaterial = 0;
  let totalGGF = 0;
  let totalMes = 0;
  let totalCC = 0;

  tbody.innerHTML = registrosFiltrados.map(r => {
    totalMaterial += (Number(r.material) || 0);
    totalGGF += (Number(r.ggf) || 0);
    totalMes += (Number(r.custo_do_mes) || 0);
    totalCC += (Number(r.custo_cc) || 0);
    
    return `<tr data-id="${r.id}" style="cursor: pointer;">
      ${colunasAtuais.map(c => {
        let val = r[c.key] ?? '';
        if (c.fmt === 'moeda') val = fmtMoeda(val);
        if (c.fmt === 'data' && val) val = new Date(val).toLocaleDateString('pt-BR', {timeZone:'UTC'});
        return `<td title="${val}">${val}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  // --- CÁLCULOS DO BUDGET ---
  let bManutencao = budgetMetadata ? (budgetMetadata.manutencao || 0) : 0;
  let bFerramentaria = budgetMetadata ? (budgetMetadata.ferramentaria || 0) : 0;
  let bFacilities = budgetMetadata ? (budgetMetadata.facilities || 0) : 0;
  let bTotal = budgetMetadata ? (budgetMetadata.total || 0) : 0;

  let rManutServ = 0, rManutCons = 0;
  let rFerramServ = 0, rFerramCons = 0;
  let rFacilServ = 0, rFacilCons = 0;

  // Calculando Realizado COM BASE NO FILTRO APLICADO NA TELA (Para que os KPIs reflitam o filtro Excel)
  for (let r of registrosFiltrados) {
    let custo = Number(r.custo_cc) || 0;
    if (custo === 0) continue;
    // Regra oficial da planilha: se it-codigo começa com "SER", é serviço. Senão, é consumo.
    let it_codigo = String(r.it_codigo || '').trim().toUpperCase();
    let isConsumo = !it_codigo.startsWith('SER');

    // Opção 1: Usar a "Área" do solicitante calculada no db.js (reproduzindo exatamente o Excel)
    let area = String(r.area || '').trim().toUpperCase();
    
    // Normalizando a string para o gráfico, mas para o Budget Consumido vamos reproduzir o SUMIF do Excel
    area = area.replace('Ç', 'C').replace('Ã', 'A');

    // Reproduzindo o SUMIF exato do Excel da aba DADOS (A16:A21)
    // O Excel falha em somar áreas que vieram sem acento ou com espaço sobrando do VLOOKUP
    // Para bater os 657k exatos, precisamos usar a string 'check' (coluna AM do Excel) e ignorar as que não batem perfeitamente.
    let checkStr = String(r.check || '').toLowerCase().trim();

    if (checkStr === 'ferramentaria - real consumo' || checkStr === 'ferramentas - real consumo') {
      rFerramCons += custo;
    } else if (checkStr === 'ferramentaria - real compras serv' || checkStr === 'ferramentas - real compras serv') {
      rFerramServ += custo;
    } else if (checkStr === 'facilities - real consumo') {
      rFacilCons += custo;
    } else if (checkStr === 'facilities - real compras serv') {
      rFacilServ += custo;
    } else if (checkStr === 'manutenção - real consumo') {
      rManutCons += custo;
    } else if (checkStr === 'manutenção - real compras serv') {
      rManutServ += custo;
    }
    // Os custos que forem 'OUTROS' ou cujo solicitante não foi encontrado (area vazia)
    // são ignorados do "Budget Consumido" composto de Manutenção+Ferramentaria+Facilities,
    // garantindo que os valores batam perfeitamente com a planilha original.
  }

  let realManut = rManutServ + rManutCons;
  const realFerram = rFerramServ + rFerramCons;
  const realFacil = rFacilServ + rFacilCons;
  const realTotal = realManut + realFerram + realFacil;

  // Atualizando KPIs (Novos Widgets Premium - Apex Finance Architecture)
  if (dashboardData) {
    let bAnual = dashboardData.budget_anual || 0;
    let rTotal = dashboardData.realizado_total || 0;
    let perc = bAnual > 0 ? (rTotal / bAnual) * 100 : 0;
    
    if ($('#cgBudgetConsumidoPct')) $('#cgBudgetConsumidoPct').textContent = perc.toFixed(0) + '%';
    if ($('#cgBudgetConsumido')) $('#cgBudgetConsumido').textContent = fmtMoeda(rTotal);
    if ($('#cgBudgetTotalFlex')) $('#cgBudgetTotalFlex').textContent = fmtMoeda(bAnual);
    
    const circle = $('#apexRingFill');
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = radius * 2 * Math.PI;
      const offset = circumference - (Math.min(perc, 100) / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      circle.style.stroke = perc > 100 ? '#ef4444' : 'url(#apex-gradient)';
    }

    if ($('#cgManutConsol')) $('#cgManutConsol').textContent = fmtMoeda(dashboardData.realizado_manutencao || realManut);
    if ($('#cgFerramConsol')) $('#cgFerramConsol').textContent = fmtMoeda(dashboardData.realizado_ferramentaria || realFerram);
    if ($('#cgFacilConsol')) $('#cgFacilConsol').textContent = fmtMoeda(dashboardData.realizado_facilities || realFacil);

  } else {
    // Fallback caso ainda não tenha Dashboard Metadata
    let bAnual = bTotal; // Fallback para budget AOP
    let perc = bAnual > 0 ? (realTotal / bAnual) * 100 : 0;
    
    if ($('#cgBudgetConsumidoPct')) $('#cgBudgetConsumidoPct').textContent = perc.toFixed(0) + '%';
    if ($('#cgBudgetConsumido')) $('#cgBudgetConsumido').textContent = fmtMoeda(realTotal);
    if ($('#cgBudgetTotalFlex')) $('#cgBudgetTotalFlex').textContent = fmtMoeda(bAnual);
    
    const circle = $('#apexRingFill');
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = radius * 2 * Math.PI;
      const offset = circumference - (Math.min(perc, 100) / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }
    
    if ($('#cgManutConsol')) $('#cgManutConsol').textContent = fmtMoeda(realManut);
    if ($('#cgFerramConsol')) $('#cgFerramConsol').textContent = fmtMoeda(realFerram);
    if ($('#cgFacilConsol')) $('#cgFacilConsol').textContent = fmtMoeda(realFacil);
  }

  // Atualizando as quebras táticas e budgets de cada área
  if ($('#cgManutServico')) $('#cgManutServico').textContent = fmtMoeda(rManutServ);
  if ($('#cgManutConsumo')) $('#cgManutConsumo').textContent = fmtMoeda(rManutCons);
  if ($('#cgFerramServico')) $('#cgFerramServico').textContent = fmtMoeda(rFerramServ);
  if ($('#cgFerramConsumo')) $('#cgFerramConsumo').textContent = fmtMoeda(rFerramCons);
  if ($('#cgFacilServico')) $('#cgFacilServico').textContent = fmtMoeda(rFacilServ);
  if ($('#cgFacilConsumo')) $('#cgFacilConsumo').textContent = fmtMoeda(rFacilCons);

  if ($('#cgManutBudget')) $('#cgManutBudget').textContent = fmtMoeda(bManutencao);
  if ($('#cgFerramBudget')) $('#cgFerramBudget').textContent = fmtMoeda(bFerramentaria);
  if ($('#cgFacilBudget')) $('#cgFacilBudget').textContent = fmtMoeda(bFacilities);

  // Alertas Inteligentes e Explainability da IA
  const widgetAlertas = $('#widgetAlertasInteligentes');
  const containerAlertas = $('#alertasInteligentesContainer');
  const widgetExplainability = $('#widgetExplainability');
  
  if (widgetAlertas && containerAlertas) {
    if (forecastMetadata && forecastMetadata.alerts && forecastMetadata.alerts.length > 0) {
      widgetAlertas.style.display = 'flex';
      containerAlertas.innerHTML = forecastMetadata.alerts.map(a => `
        <div style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--danger); padding: 0.75rem 1rem; border-radius: 4px; font-size: 0.85rem; color: #fff;">
          ${a}
        </div>
      `).join('');
    } else {
      widgetAlertas.style.display = 'none';
      containerAlertas.innerHTML = '';
    }
  }

  if (widgetExplainability) {
    const aside = $('#asideExplainability');
    if (forecastMetadata && forecastMetadata.twin_month) {
      widgetExplainability.style.display = 'flex';
      if (aside) aside.style.display = 'block';
      if ($('#aiProjFinal'))    $('#aiProjFinal').textContent    = fmtMoeda(forecastMetadata.projecao_final || 0);
      if ($('#aiVolOrdens'))    $('#aiVolOrdens').textContent    = forecastMetadata.volume_ordens_atual || 0;
      if ($('#aiTwinMonth'))    $('#aiTwinMonth').textContent    = forecastMetadata.twin_month;
      if ($('#aiRangeMin'))     $('#aiRangeMin').textContent     = fmtMoeda(forecastMetadata.projecao_min ?? forecastMetadata.projecao_final ?? 0);
      if ($('#aiRangeMax'))     $('#aiRangeMax').textContent     = fmtMoeda(forecastMetadata.projecao_max ?? forecastMetadata.projecao_final ?? 0);
      if ($('#aiConfianca'))    $('#aiConfianca').textContent    = (forecastMetadata.confianca_pct != null ? forecastMetadata.confianca_pct + '%' : '—');
      if ($('#aiSimilaridade')) $('#aiSimilaridade').textContent = (forecastMetadata.twin_month_similaridade != null ? forecastMetadata.twin_month_similaridade : '—');
    } else {
      widgetExplainability.style.display = 'none';
      if (aside) aside.style.display = 'none';
    }
  }

  // Chamar renderização dos gráficos
  let metaMesAnual = bTotal / 12;
  renderChartsCustoGeral(registrosCustoGeral || [], metaMesAnual);

  // Renderizando Tabela Detalhada
  const tabContainer = $('#tabelaBudgetsContainer');
  const tabBody = $('#tabelaDetalhamentoBudgets tbody');
  if (tabContainer && tabBody) {
    if (budgetMetadata) {
      tabContainer.style.display = 'block';
      
      const diaAtual = new Date().getDate();
      
      const renderRow = (area, tipo, percStr, metaMes, metaSemana, real, planejDia) => {
        let estAcumulada = planejDia * diaAtual;
        return `<tr>
          <td style="text-align: left;">${area}</td>
          <td style="text-align: left;">${tipo}</td>
          <td>${percStr}</td>
          <td>${fmtMoeda(metaMes)}</td>
          <td>${fmtMoeda(metaSemana)}</td>
          <td style="font-weight: 500; color: ${real > metaMes ? 'var(--danger)' : 'var(--success)'}">${fmtMoeda(real)}</td>
          <td>${fmtMoeda(estAcumulada)}</td>
          <td>${fmtMoeda(planejDia)}</td>
        </tr>`;
      };

      let html = '';

      // Percentuais reais de cada área sobre o total (dinâmicos)
      const pctManut  = bTotal > 0 ? (bManutencao   / bTotal * 100) : 0;
      const pctFerram = bTotal > 0 ? (bFerramentaria / bTotal * 100) : 0;
      const pctFacil  = bTotal > 0 ? (bFacilities    / bTotal * 100) : 0;
      const fmtPct = v => v.toFixed(1).replace('.', ',') + '%';

      // META MÊS por tipo: se houver split configurado nas categorias, usa; senão 50/50
      const cats = budgetMetadata?.categorias || {};
      const splitManutServ = cats.manut_serv_pct != null ? (cats.manut_serv_pct / 100) : 0.5;
      const splitFerramServ = cats.ferram_serv_pct != null ? (cats.ferram_serv_pct / 100) : 0.5;
      const splitFacilServ  = cats.facil_serv_pct  != null ? (cats.facil_serv_pct  / 100) : 0.5;

      const metaManutServ  = bManutencao   * splitManutServ;
      const metaManutCons  = bManutencao   * (1 - splitManutServ);
      const metaFerramServ = bFerramentaria * splitFerramServ;
      const metaFerramCons = bFerramentaria * (1 - splitFerramServ);
      const metaFacilServ  = bFacilities   * splitFacilServ;
      const metaFacilCons  = bFacilities   * (1 - splitFacilServ);

      // Dias úteis do mês atual (aproximação: dias corridos - domingos)
      const hoje = new Date();
      const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const diasUteis = Math.round(diasNoMes * 5 / 7); // ~aprox
      const semanasNoMes = diasNoMes / 7;

      html += renderRow('MANUTENÇÃO',   'SERV', fmtPct(pctManut),  metaManutServ,  metaManutServ  / semanasNoMes, rManutServ,  metaManutServ  / diasNoMes);
      html += renderRow('',             'CONS', fmtPct(pctManut),  metaManutCons,  metaManutCons  / semanasNoMes, rManutCons,  metaManutCons  / diasNoMes);

      html += renderRow('FERRAMENTARIA','SERV', fmtPct(pctFerram), metaFerramServ, metaFerramServ / semanasNoMes, rFerramServ, metaFerramServ / diasNoMes);
      html += renderRow('',             'CONS', fmtPct(pctFerram), metaFerramCons, metaFerramCons / semanasNoMes, rFerramCons, metaFerramCons / diasNoMes);

      html += renderRow('FACILITIES',   'SERV', fmtPct(pctFacil),  metaFacilServ,  metaFacilServ  / semanasNoMes, rFacilServ,  metaFacilServ  / diasNoMes);
      html += renderRow('',             'CONS', fmtPct(pctFacil),  metaFacilCons,  metaFacilCons  / semanasNoMes, rFacilCons,  metaFacilCons  / diasNoMes);

      html += `<tr style="background: rgba(255,255,255,0.05); font-weight: bold;">
        <td colspan="3" style="text-align: left; color: #fff;">TOTAL</td>
        <td style="color: #fff;">${fmtMoeda(bTotal)}</td>
        <td style="color: #fff;">${fmtMoeda(bTotal / semanasNoMes)}</td>
        <td style="color: #fff;">${fmtMoeda(realTotal)}</td>
        <td style="color: #fff;">${fmtMoeda((bTotal / diasNoMes) * diaAtual)}</td>
        <td style="color: #fff;">${fmtMoeda(bTotal / diasNoMes)}</td>
      </tr>`;

      tabBody.innerHTML = html;
    } else {
      tabContainer.style.display = 'none';
    }
  }

  
  // --- INÍCIO ALERTAS DE BUDGET POR CAIXINHA ---
  if (budgetMetadata && budgetMetadata.categorias) {
    const cats = budgetMetadata.categorias;
    const limitMO = cats.mo_terceiros || 0;
    const limitCorretiva = cats.pecas_corretiva || 0;
    const limitPreventiva = cats.pecas_preventiva || 0;
    const limitReparo = cats.materiais_reparo || 0;
    const limitDebito = cats.debito_direto || 0;

    let consMO = 0;
    let consCorretiva = 0;
    let consPreventiva = 0;
    let consReparo = 0;
    let consDebito = 0;

    // Calcular Consertos (Reparo) e Compras (Débito)
    registros.forEach(r => {
      if (r.natureza === 'CONSERTO') consReparo += (Number(r.valor) || 0);
      if (r.natureza === 'COMPRA') consDebito += (Number(r.valor) || 0);
    });

    // Calcular do Custo Geral (M.O Terceiros, Peças)
    if (window.registrosCustoGeralGlobais) {
      window.registrosCustoGeralGlobais.forEach(r => {
        if (!r.descricao_codigo) return;
        const desc = r.descricao_codigo.toLowerCase();
        const valor = Number(r.custo_do_mes) || 0;
        if (desc.includes('m.o terceiros') || desc.includes('m.o. terceiros')) consMO += valor;
        else if (desc.includes('peças corretiva') || desc.includes('pecas corretiva')) consCorretiva += valor;
        else if (desc.includes('peças preventiva') || desc.includes('pecas preventiva')) consPreventiva += valor;
      });
    }

    const verificacoes = [
      { id: 'mo_terceiros', nome: 'M.O Terceiros', limit: limitMO, cons: consMO },
      { id: 'pecas_corretiva', nome: 'Peças Corretiva', limit: limitCorretiva, cons: consCorretiva },
      { id: 'pecas_preventiva', nome: 'Peças Preventiva', limit: limitPreventiva, cons: consPreventiva },
      { id: 'materiais_reparo', nome: 'Materiais Reparo (Consertos)', limit: limitReparo, cons: consReparo },
      { id: 'debito_direto', nome: 'Débito Direto (Compras)', limit: limitDebito, cons: consDebito }
    ];

    window._budgetVerificacoes = verificacoes; // save for alerts.js to consume
  }
  // --- FIM ALERTAS DE BUDGET POR CAIXINHA ---
    // Disparar Alertas de Budget
    if (window._budgetVerificacoes && !window._budgetAlertaDisparado) {
      window._budgetAlertaDisparado = true;
      let estourados = [];
      window._budgetVerificacoes.forEach(v => {
        if (v.limit > 0) {
          const perc = (v.cons / v.limit) * 100;
          if (perc > 100) estourados.push(v);
        }
      });

      
        // Avisos no Sininho (Acima de 85%)
        let qteAvisos = 0;
        window._budgetVerificacoes.forEach(v => {
          if (v.limit > 0) {
            const perc = (v.cons / v.limit) * 100;
            if (perc >= 85 && perc <= 100) {
              // Simular a injeção no sininho
              qteAvisos++;
            }
          }
        });
        if (qteAvisos > 0) {
           const badge = document.getElementById('alertaBadgeCount');
           if (badge) {
             let atual = parseInt(badge.textContent || '0');
             badge.textContent = atual + qteAvisos;
             badge.style.display = 'flex';
           }
        }

      if (estourados.length > 0) {
        // Encontrar os responsaveis por essas areas
        let msgs = [];
        estourados.forEach(e => {
          let responsaveis = [];
          Object.keys(usersHierarchy).forEach(u => {
            if (usersHierarchy[u].budget_areas && usersHierarchy[u].budget_areas.includes(e.id)) {
              responsaveis.push(u);
            }
          });
          msgs.push(`A área <b>${e.nome}</b> atingiu ${((e.cons/e.limit)*100).toFixed(1)}% do limite. <br><small>Responsáveis: ${responsaveis.length ? responsaveis.join(', ') : 'Nenhum'}</small>`);
        });

        setTimeout(() => {
          Swal.fire({
            title: 'Alerta de Orçamento',
            html: msgs.join('<br><br>'),
            icon: 'warning',
            background: '#1e293b',
            color: '#f8fafc',
            confirmButtonColor: '#facc15',
            confirmButtonText: 'Ciente',
            backdrop: `rgba(0,0,0,0.8)`
          });
        }, 1500); // Dar tempo para a tela carregar
      }
    }


  // --- FIM DOS CÁLCULOS DO BUDGET ---

  function renderChartsCustoGeral(todosRegistros, budgetMensal) {
    if (!window.echarts) return;
    // ─── FONTE PRIMÁRIA: aba DASHBOARD do Excel ─────────────────────────────────
    const dash = window.dashboardData || {};
    const evolucao = dash.evolucao || {};

    let dadosManut  = (evolucao.manutencao   || []).slice();
    let dadosFerram = (evolucao.ferramentaria || []).slice();
    let dadosFacil  = (evolucao.facilities    || []).slice();
    let budgetMeses = (evolucao.budget        || []).slice();

    while (dadosManut.length  < 12) dadosManut.push(0);
    while (dadosFerram.length < 12) dadosFerram.push(0);
    while (dadosFacil.length  < 12) dadosFacil.push(0);
    while (budgetMeses.length < 12) budgetMeses.push(0);

    // Fallback: se o DASHBOARD não veio, calcular dos registros
    const temDashboard = dadosManut.some(v => v > 0) || dadosFerram.some(v => v > 0);
    let ccMap = {}, linhaMap = {}, tecnicoMap = {}, relacao = {};

    for (let r of todosRegistros) {
      if (r.it_codigo === 'BUDGET_METADATA' || r.it_codigo === 'FORECAST_METADATA' || r.it_codigo === 'DIFF_METADATA') continue;
      let custo = Math.abs(Number(r.custo_do_mes) || 0);
      if (custo === 0) continue;
      
      // Classificação para Gráficos Secundários
      let cc = String(r.cc || '').trim();
      if (cc && cc !== 'null' && cc !== 'undefined') ccMap[cc] = (ccMap[cc] || 0) + custo;
      
      let linha = String(r.linha || '').trim();
      let tec   = String(r.nome_solicitante || '').trim();
      if (linha && tec && linha !== 'null' && tec !== 'null') {
        linhaMap[linha] = (linhaMap[linha] || 0) + custo;
        tecnicoMap[tec] = (tecnicoMap[tec] || 0) + custo;
        if (!relacao[tec]) relacao[tec] = {};
        relacao[tec][linha] = (relacao[tec][linha] || 0) + custo;
      }

      // Fallback Evolução
      if (!temDashboard) {
        let mesIdx = parseInt(String(r.mes || '').trim()) - 1;
        const area = String(r.area || '').toUpperCase();
        if (mesIdx >= 0 && mesIdx <= 11) {
          if (area.includes('FERRAM')) dadosFerram[mesIdx] += custo;
          else if (area.includes('FACIL') || area.includes('UTILID')) dadosFacil[mesIdx] += custo;
          else dadosManut[mesIdx] += custo;
        }
      }
    }

    if (!budgetMeses.some(v => v > 0) && budgetMensal > 0) {
      budgetMeses = new Array(12).fill(budgetMensal);
    }
    
    // --- Renderizar Gráfico de Evolução (Misto PREMIUM) ---
    const ctxEvolucao = document.getElementById('chartEvolucaoCustos');
    if (ctxEvolucao) {
      let chartEvolucao = echarts.getInstanceByDom(ctxEvolucao) || echarts.init(ctxEvolucao);
      
      const fmtK = v => v >= 1e6 ? 'R$ ' + (v/1e6).toFixed(1) + 'M' : v >= 1000 ? 'R$ ' + (v/1000).toFixed(0) + 'k' : 'R$ 0';
      const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // Detectar meses de estouro
      const markAreas = [];
      const mesAtual = new Date().getMonth();
      for (let i = 0; i <= mesAtual; i++) {
        const total = dadosManut[i] + dadosFerram[i] + dadosFacil[i];
        if (budgetMeses[i] > 0 && total > budgetMeses[i]) {
          markAreas.push([{ xAxis: mesesArr[i], itemStyle: { color: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 } }, { xAxis: mesesArr[i] }]);
        }
      }

      // Estilização Mês
      const mkStyle = (baseHi, baseLo, idx) => idx > mesAtual
        ? { opacity: 0.25, color: baseLo }
        : { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: baseHi}, {offset: 1, color: baseLo}]) };
        
      const manutData  = dadosManut.map((v, i)  => ({ value: v, itemStyle: mkStyle('#60a5fa', '#3b82f6', i) }));
      const ferramData = dadosFerram.map((v, i) => ({ value: v, itemStyle: mkStyle('#c4b5fd', '#8b5cf6', i) }));
      const facilData  = dadosFacil.map((v, i)  => ({ value: v, itemStyle: mkStyle('#6ee7b7', '#10b981', i) }));

      chartEvolucao.setOption({
        backgroundColor: 'transparent',
        animation: true, animationDuration: 900, animationEasing: 'cubicOut',
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.02)' } },
          backgroundColor: 'rgba(9,9,11,0.97)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1, borderRadius: 12, padding: [14, 18],
          textStyle: { color: '#f1f5f9', fontFamily: 'Inter, sans-serif', fontSize: 13 },
          extraCssText: 'box-shadow:0 24px 64px rgba(0,0,0,0.85);',
          formatter: params => {
            const mi = mesesArr.indexOf(params[0]?.axisValue || '');
            const manut = dadosManut[mi] || 0, ferram = dadosFerram[mi] || 0, facil = dadosFacil[mi] || 0;
            const total = manut + ferram + facil, budget = budgetMeses[mi] || 0, saldo = budget - total;
            const pct = budget > 0 ? ((total / budget) * 100).toFixed(1) : null;
            const saldoCor = saldo < 0 ? '#f87171' : '#4ade80';
            const pctCor = pct ? (parseFloat(pct) > 100 ? '#f87171' : parseFloat(pct) > 80 ? '#fbbf24' : '#4ade80') : '#4ade80';
            const badge = mi > mesAtual ? `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:1px 7px;border-radius:5px;font-size:10px;margin-left:6px;font-weight:600;">PROJEÇÃO</span>` : '';
            return `<div style="font-weight:700;font-size:14px;margin-bottom:10px;color:#fff;">${mesesArr[mi]} 2026${badge}</div>
              <div style="display:grid;grid-template-columns:1fr auto;gap:3px 18px;font-size:12px;color:#cbd5e1;margin-bottom:10px;">
                <span>🔵 Manutenção</span><span style="text-align:right;font-weight:600;color:#93c5fd;">${fmtBRL(manut)}</span>
                <span>🟣 Ferramentaria</span><span style="text-align:right;font-weight:600;color:#c4b5fd;">${fmtBRL(ferram)}</span>
                <span>🟢 Facilities</span><span style="text-align:right;font-weight:600;color:#6ee7b7;">${fmtBRL(facil)}</span>
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:9px;display:grid;grid-template-columns:1fr auto;gap:3px 18px;font-size:12px;">
                <span style="color:#94a3b8;">Total</span><span style="text-align:right;font-weight:800;font-size:15px;color:#fff;">${fmtBRL(total)}</span>
                ${budget > 0 ? `<span style="color:#94a3b8;">Budget</span><span style="text-align:right;color:#e2e8f0;">${fmtBRL(budget)}</span>` : ''}
                ${budget > 0 ? `<span style="color:#94a3b8;">Saldo</span><span style="text-align:right;font-weight:700;color:${saldoCor};">${fmtBRL(saldo)}</span>` : ''}
                ${pct ? `<span style="color:#94a3b8;">% Consumido</span><span style="text-align:right;font-weight:700;color:${pctCor};">${pct}%</span>` : ''}
              </div>`;
          }
        },
        legend: { data: ['Manutenção', 'Ferramentaria', 'Facilities', 'Budget'], bottom: 4, textStyle: { color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 6, itemGap: 22 },
        grid: { left: '1%', right: '1%', bottom: '13%', top: '3%', containLabel: true },
        xAxis: [{ type: 'category', data: mesesArr, axisLabel: { color: '#64748b', fontFamily: 'Inter, sans-serif', fontSize: 11, interval: 0 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisTick: { show: false } }],
        yAxis: [{ type: 'value', axisLabel: { color: '#64748b', fontFamily: 'Inter, sans-serif', fontSize: 11, formatter: v => fmtK(v) }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } }],
        series: [
          { name: 'Budget', type: 'line', data: budgetMeses, z: 10, symbol: 'none', lineStyle: { color: 'rgba(255,255,255,0.3)', type: 'dashed', width: 1.5 }, itemStyle: { color: '#fff' }, markArea: { silent: true, data: markAreas }, markLine: { silent: true, symbol: 'none', data: [{ xAxis: mesesArr[mesAtual], lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { show: true, formatter: 'Mês atual', position: 'insideEndTop', color: '#f59e0b', fontSize: 10 } }] } },
          { name: 'Manutenção',    type: 'bar', stack: 'Total', barMaxWidth: 44, data: manutData,  itemStyle: { borderRadius: [0,0,0,0] }, emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(59,130,246,0.5)' } } },
          { name: 'Ferramentaria', type: 'bar', stack: 'Total', barMaxWidth: 44, data: ferramData, itemStyle: { borderRadius: [0,0,0,0] }, emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(139,92,246,0.5)' } } },
          { name: 'Facilities',    type: 'bar', stack: 'Total', barMaxWidth: 44, data: facilData,  itemStyle: { borderRadius: [4,4,0,0] }, emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(16,185,129,0.5)' } } }
        ]
      }, true);
    }

    // --- Renderizar Gráfico de Estratificação por C.C. ---
    const ctxCC = document.getElementById('chartEstratificacaoCC');
    if (ctxCC) {
      let chartCC = echarts.getInstanceByDom(ctxCC) || echarts.init(ctxCC);
      let ccArr = Object.keys(ccMap).map(k => ({ nome: k, valor: ccMap[k] })).sort((a,b) => b.valor - a.valor).slice(0,10).reverse();
      chartCC.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(9,9,11,0.97)', borderColor: 'rgba(255,255,255,0.07)', textStyle: { color: '#f1f5f9' }, formatter: p => `${p[0].name}<br/>${p[0].marker} ${(p[0].value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}` },
        grid: { left: '2%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
        xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10, formatter: v => 'R$' + (v/1000).toFixed(0) + 'k' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'category', data: ccArr.map(i => i.nome), axisLabel: { color: '#94a3b8', fontSize: 10 }, axisTick: { show: false }, axisLine: { show: false } },
        series: [{ type: 'bar', data: ccArr.map(i => ({ value: i.valor, itemStyle: { color: new echarts.graphic.LinearGradient(1,0,0,0,[{offset:0,color:'#3b82f6'},{offset:1,color:'rgba(59,130,246,0.12)'}]), borderRadius: [0,4,4,0] } })), barMaxWidth: 18 }]
      });
    }

    // --- Radar Técnicos ---
    let topLinhas   = Object.keys(linhaMap).map(k => ({nome:k,val:linhaMap[k]})).sort((a,b)=>b.val-a.val).slice(0,5).map(x=>x.nome);
    let topTecnicos = Object.keys(tecnicoMap).map(k => ({nome:k,val:tecnicoMap[k]})).sort((a,b)=>b.val-a.val).slice(0,5).map(x=>x.nome);
    const ctxRadar  = document.getElementById('chartRadarTecnicos');
    if (ctxRadar && topLinhas.length > 0 && topTecnicos.length > 0) {
      let chartRdr = echarts.getInstanceByDom(ctxRadar) || echarts.init(ctxRadar);
      const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'];
      let rds = topTecnicos.map((tec,i) => ({ name: tec.split(' ')[0], value: topLinhas.map(l => (relacao[tec]&&relacao[tec][l])||0), itemStyle: { color: colors[i%colors.length] }, lineStyle: { width: 2 } }));
      let maxG = Math.max(...topLinhas.map(l => Math.max(...topTecnicos.map(t => (relacao[t]&&relacao[t][l])||0)))) || 1;
      chartRdr.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', backgroundColor: 'rgba(9,9,11,0.97)', borderColor: 'rgba(255,255,255,0.07)', textStyle: { color: '#f1f5f9', fontSize: 12 }, formatter: p => { let res = `<strong>${p.name}</strong><br/>`; topLinhas.forEach((l,i) => { res += `${l}: ${(p.value[i]||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}<br/>`; }); return res; } },
        legend: { data: rds.map(d=>d.name), bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
        radar: { indicator: topLinhas.map(l => ({ name: l.length > 15 ? l.substring(0,15) + '…' : l, max: maxG * 1.1 })), splitNumber: 4, axisName: { color: '#e4e4e7', fontSize: 10, fontFamily: 'Inter' }, splitArea: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } } },
        series: [{ type: 'radar', data: rds, symbol: 'circle', symbolSize: 4, areaStyle: { opacity: 0.15 } }]
      });
    }
  }

  linhaSelecionadaCustoGeralId = null;

  function atualizarBarraLinhaCustoGeral() {
    const bar = $('#rowActionBarCustoGeral');
    const label = $('#rowActionLabelCustoGeral');
    if (!bar) return;

    if (!linhaSelecionadaCustoGeralId) {
      bar.classList.add('hidden');
      return;
    }

    const r = (registrosCustoGeral || []).find(x => String(x.id) === String(linhaSelecionadaCustoGeralId));
    if (!r) {
      linhaSelecionadaCustoGeralId = null;
      bar.classList.add('hidden');
      return;
    }

    bar.classList.remove('hidden');
    if (label) {
      const materialStr = fmtMoeda(r.material || 0);
      label.textContent = `Ordem: ${r.numero_ordem || '—'} · Cód. Solicitante: ${r.solicitante || '—'} · Nome: ${r.nome_solicitante || '—'} · Material: ${materialStr} · Área: ${r.area || '—'}`;
    }
  }

  function selecionarLinhaCustoGeral(id) {
    linhaSelecionadaCustoGeralId = id;
    document.querySelectorAll('#tabelaBodyCustoGeral tr').forEach((tr) => {
      tr.classList.toggle('row-selected', String(tr.dataset.id) === String(id));
    });
    atualizarBarraLinhaCustoGeral();
  }

  // Bind the Ver Detalhes button on the action bar
  const btnRowDetalheCG = $('#btnRowDetalheCustoGeral');
  if (btnRowDetalheCG && !btnRowDetalheCG.dataset.bound) {
    btnRowDetalheCG.dataset.bound = 'true';
    btnRowDetalheCG.addEventListener('click', () => {
      if (!linhaSelecionadaCustoGeralId) return;
      const r = (registrosCustoGeral || []).find(x => String(x.id) === String(linhaSelecionadaCustoGeralId));
      if (!r) return;
      abrirDrilldown({
        titulo: `Ordem: ${r.numero_ordem}`,
        subtitulo: `${r.descricao_codigo || r.it_codigo}`,
        registros: [r],
        meta: { isCustoGeral: true }
      });
    });
  }

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => selecionarLinhaCustoGeral(tr.dataset.id));
    tr.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const id = tr.dataset.id;
      const r = registrosFiltrados.find(x => String(x.id) === String(id));
      if (!r) return;
      abrirDrilldown({
        titulo: `Ordem: ${r.numero_ordem}`,
        subtitulo: `${r.descricao_codigo || r.it_codigo}`,
        registros: [r],
        meta: { isCustoGeral: true }
      });
    });
  });
}

// PLANO MESTRE INIT
initPlanoMestre();
initImportPlanoMestre();

// ===================================================
// SISTEMA DE NOTIFICAÇÕES DE PRAZOS POR USUÁRIO
// ===================================================
async function checkPrazosAlerts() {
  if (!window.currentUser || !window.currentUser.email) return;

  try {
    // 1. Fetch user's acknowledged notifications
    const resp = await fetch(`/api/prazo_ciente?email=${encodeURIComponent(window.currentUser.email)}`);
    const cientes = await resp.json();

    // 2. Filter unread status changes
    const deployDate = new Date('2026-07-07T00:00:00Z');
    const unread = [];

    registros.forEach(r => {
      // Only process records for CONSERTO and COMPRA
      if (r.natureza !== 'CONSERTO' && r.natureza !== 'COMPRA') return;
      if (r.data_recebimento) return; // Ignore finished items

      // Check modification date so we don't spam for all 232 old records
      const recordDate = new Date(r.last_modified_at || r.created_at || '1970-01-01');
      if (recordDate < deployDate) return;

      const diasFora = r.dias_fora ?? calcularDiasFora(r);
      if (diasFora == null || diasFora < 0) return;

      let faixa = null;
      if (diasFora <= 35) faixa = 'Em dias';
      else if (diasFora <= 75) faixa = 'Pendente de retorno';
      else faixa = 'Atrasado para retorno';

      if (!faixa) return;

      // Check if user already acknowledged this exact status
      const jaViu = cientes.some(c => String(c.registro_id) === String(r.id) && c.faixa_prazo === faixa);
      if (!jaViu) {
        unread.push({
          registro_id: r.id,
          faixa_prazo: faixa,
          item: r.item,
          rc: r.rc,
          fornecedor: r.fornecedor,
          diasFora: diasFora
        });
      }
    });

    if (unread.length === 0) return;

    // 3. Show modal
    const listaEl = document.getElementById('listaAlertasDia');
    if (!listaEl) return;

    listaEl.innerHTML = unread.map(u => {
      const badgeColor = u.faixa_prazo === 'Em dias' ? '#10b981' : (u.faixa_prazo === 'Pendente de retorno' ? '#f59e0b' : '#ef4444');
      const isAtrasado = u.faixa_prazo === 'Atrasado para retorno';
      const borderColor = isAtrasado ? 'border-left: 4px solid #ef4444; border-top: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);' : 'border: 1px solid rgba(255,255,255,0.05);';
      
      return `
        <li style="background: rgba(10, 15, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); ${borderColor} padding: 0.75rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--primary);">${u.rc || 'Sem RC'}</strong>
            <span style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: ${badgeColor}; color: #fff;">
              ${u.faixa_prazo} (${u.diasFora}d)
            </span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-light);">${u.item || 'Sem descrição'}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">${u.fornecedor || '-'}</div>
        </li>
      `;
    }).join('');

    const modal = document.getElementById('modalAlertasDia');
    if (modal) modal.classList.add('open');

    // 4. Handle "Ciente" e "Fechar"
    const btnCiente = document.getElementById('btnOkAlertasDia');
    const btnFechar = document.getElementById('btnFecharAlertasDia');
    
    if (btnFechar) {
      btnFechar.onclick = () => modal.classList.remove('open');
    }

    if (btnCiente) {
      // Remove any old listeners by cloning
      const newBtn = btnCiente.cloneNode(true);
      btnCiente.parentNode.replaceChild(newBtn, btnCiente);
      
      newBtn.addEventListener('click', async () => {
        newBtn.textContent = 'Salvando...';
        newBtn.disabled = true;
        
        try {
          await fetch('/api/prazo_ciente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: window.currentUser.email,
              notificacoes: unread
            })
          });
          modal.classList.remove('open');
        } catch (err) {
          console.error(err);
          alert('Erro ao confirmar leitura.');
        } finally {
          newBtn.textContent = 'Ciente';
          newBtn.disabled = false;
        }
      });
    }

  } catch (err) {
    console.error("Erro ao buscar alertas de prazo:", err);
  }
}
