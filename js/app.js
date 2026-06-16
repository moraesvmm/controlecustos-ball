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
} from './logic.js?v=2';
import { initCalendario, updateCalendario } from './calendario.js?v=2';
import { 
carregarRegistros, salvarRegistro, excluirRegistro, duplicarRegistro, signIn, signUp, signOut, onAuthStateChange, 
getClient, carregarPreventiva, salvarPreventiva, excluirPreventiva, getMachines, getMachineActivities, createMachine, 
createMachineActivity, getFornecedoresContatos, upsertFornecedorContato,
getTarefasDelegadas, criarTarefaDelegada, atualizarStatusTarefa, subscribeTarefas } from './db.js';
import { renderDashboardCharts, renderCrudMesChart, destroyCrudMesChart } from './charts.js?v=4';
import {
  COLUNAS_TABELA,
  valorCelula,
  exportarExcel,
  toast,
  confirmar,
  fmtMoeda,
} from './ui.js?v=3';
import { abrirDrilldown, fecharDrilldown, setDrilldownEditHandler, setDrilldownPhotoHandler, setDrilldownViewHandler } from './drilldown.js?v=7';
import { initExcelImport } from './import_excel.js?v=8';

import { initExcelImportPreventiva, initExcelImportPreventivaFrontend } from './import_excel_preventiva.js?v=3';
import { gerarRelatorioExecutivoPDF, gerarRelatorioSLAPDF, gerarChecklistLinhaPDF } from './pdf_report.js?v=8';

let registros = [];
let registrosPreventiva = [];
window.fornecedoresContatosData = [];

// =============================
// GESTÃO DE TAREFAS DELEGADAS
// =============================
let tarefasDelegadas = [];
let intervalTarefas = null;

const usersHierarchy = {
  'Vitor Moraes': { role: 'ADM' }, 
  'João Silva': { role: 'Master' },
  'Vinicius Marques': { role: 'Master' },
  'Gelcino Júnior': { role: 'Master' },
  'Victor Mello': { role: 'Pupil' },
  'Beatriz Moraes': { role: 'Pupil' },
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
let isInlineEditMode = false;
let isAppInitialized = false;
let machines = [];
let selectedMachineId = null;
let registrosPreventivaFrontend = []; // Registros com setor = 'frontend'

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
      const atrasado =
        (r.status || calcularStatus(r)) !== 'ENTREGUE' &&
        r.previsao_entrega &&
        new Date(r.previsao_entrega) < new Date();
      const sel = String(r.id) === String(linhaSelecionadaId) ? ' row-selected' : '';
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
        const registro = data.find((x) => String(x.id) === String(id));
        if (!registro) return;

        const input = document.createElement('input');
        input.type = col.startsWith('data_') ? 'date' : 'text';
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
          const updated = enriquecerRegistro({ ...registro, [col]: newVal || null });
          const index = registros.findIndex((x) => String(x.id) === String(id));
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
                     'planos-manutencao-frontend', 'plano-preventiva-frontend'].includes(name);

  const isTask = ['gestao-tarefas', 'minhas-tarefas'].includes(name);

  // Seção tabela (toolbar + tabela de RCs) - Hide for preventiva since it has its own
  $('#secaoTabela')?.classList.toggle('hidden', !['rc', 'consertos', 'compras', 'fabricacao'].includes(name));
  $('#secaoCrudGraficos')?.classList.toggle('hidden', !['consertos', 'compras', 'fabricacao'].includes(name));

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
    'valor', 'previsao_entrega', 'data_recebimento', 'comentario',
  ];
  fields.forEach((name) => {
    const input = f.querySelector(`[name="${name}"]`);
    if (input) input.value = editando[name] ?? '';
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
    try { window.fornecedoresContatosData = await getFornecedoresContatos(); } catch(e) { console.warn('Contacts table not ready'); }
    preencherDatalistFornecedoresContatos();
    registros = await carregarRegistros();
    try {
      const todosPreventiva = await carregarPreventiva();
      registrosPreventiva = todosPreventiva.filter(r => r.setor !== 'frontend');
      registrosPreventivaFrontend = todosPreventiva.filter(r => r.setor === 'frontend');
    } catch (e) { console.warn('Preventiva table not ready yet', e.message); }
    try {
      tarefasDelegadas = await getTarefasDelegadas();
      renderGestaoTarefas();
      renderMinhasTarefas();
      subscribeTarefas((payload) => {
        // Reload tasks on any change
        getTarefasDelegadas().then(data => {
          tarefasDelegadas = data;
          renderGestaoTarefas();
          renderMinhasTarefas();
          
          // Show Modal se a task is assigned to current user
          if (payload.eventType === 'INSERT' && payload.new.atribuido_para === window.currentUser?.username) {
            document.getElementById('ntrTitulo').textContent = payload.new.titulo;
            document.getElementById('ntrDe').innerHTML = `DELEGADO POR: <span style="color: var(--text); font-weight: bold;">${payload.new.atribuido_por}</span>`;
            document.getElementById('ntrDescricao').textContent = payload.new.descricao || 'Sem descrição detalhada.';
            document.getElementById('modalNovaTarefaRecebida')?.classList.add('open');
            
            toast(`Nova tarefa atribuída por ${payload.new.atribuido_por}!`, 'info');
          }
        });
      });
      // Start interval for timers
      if (!intervalTarefas) {
        intervalTarefas = setInterval(() => {
          renderGestaoTarefas(true);
          renderMinhasTarefas(true);
        }, 1000);
      }
    } catch (e) { console.warn('Tarefas table not ready yet', e.message); }
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
  setDrilldownPhotoHandler(async (id, dataUrl) => {
    const r = registros.find((x) => String(x.id) === String(id));
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
  $('#drillFechar').addEventListener('click', fecharDrilldown);
  $('#drillOverlay').addEventListener('click', fecharDrilldown);

  // ===== PDF Report Buttons =====
  $('#btnExportDashboardPdf')?.addEventListener('click', () => {
    gerarRelatorioExecutivoPDF(registros);
  });
  $('#btnExportSlaPdf')?.addEventListener('click', () => {
    gerarRelatorioSLAPDF(registros);
  });


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
        ${(r.atividades_descricoes && r.atividades_descricoes.length 
          ? r.atividades_descricoes.map(d => `<div style="margin-bottom:0.5rem;">• ${d.replace(/\n/g, '<br>')}</div>`).join('') 
          : (r.descricao ? r.descricao.replace(/\n/g, '<br>') : '-'))}
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

  document.getElementById('drillTitulo').textContent = r.identificador || 'Detalhes da Atividade';
  document.getElementById('drillSubtitulo').textContent = r.maquina || '';

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
        ${(r.atividades_descricoes && r.atividades_descricoes.length 
          ? r.atividades_descricoes.map(d => `<div style="margin-bottom:0.5rem;">• ${d.replace(/\n/g, '<br>')}</div>`).join('') 
          : (r.descricao ? r.descricao.replace(/\n/g, '<br>') : '-'))}
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
  document.getElementById('drillTitulo').textContent = r.identificador || r.maquina || 'Detalhes';
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


