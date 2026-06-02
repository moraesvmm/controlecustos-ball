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
import { carregarRegistros, salvarRegistro, excluirRegistro, duplicarRegistro, signIn, signUp, signOut, onAuthStateChange, getClient, carregarPreventiva, salvarPreventiva, excluirPreventiva, getMachines, getMachineActivities, createMachine, createMachineActivity } from './db.js';
import { renderDashboardCharts } from './charts.js?v=4';
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

import { initExcelImportPreventiva, initExcelImportPreventivaFrontend } from './import_excel_preventiva.js?v=2';
import { gerarRelatorioExecutivoPDF, gerarRelatorioSLAPDF } from './pdf_report.js';

let registros = [];
let registrosPreventiva = [];
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
    el.innerHTML = opts.map((o) => `<option value="${o}">${o}</option>`).join('');
    if (opts.includes(cur)) el.value = cur;
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
  
  const todasMaquinas = [...registrosPreventiva, ...registrosPreventivaFrontend]
     .map(r => r.maquina)
     .filter(Boolean);
  const maquinas = [...new Set(todasMaquinas)].sort();
  
  if (maquinas.length === 0) {
    ul.innerHTML = '<li style="color:var(--muted); font-size:0.85rem;">Nenhuma máquina encontrada. Importe a planilha.</li>';
    return;
  }
  
  const htmlGeral = `
    <li data-id="GERAL" style="cursor:pointer; padding:0.4rem 0.5rem; border-radius:6px; font-size:0.9rem; transition: background 0.15s; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border);" 
        onmouseover="this.style.background='rgba(255,255,255,0.06)'" 
        onmouseout="this.style.background=selectedMachineId==='GERAL'?'rgba(212,175,55,0.15)':''">Geral (Todas)</li>
  `;
  const htmlMaquinas = maquinas.map(m => `
    <li data-id="${m}" style="cursor:pointer; padding:0.4rem 0.5rem; border-radius:6px; font-size:0.9rem; transition: background 0.15s;" 
        onmouseover="this.style.background='rgba(255,255,255,0.06)'" 
        onmouseout="this.style.background=selectedMachineId===this.dataset.id?'rgba(212,175,55,0.15)':''">${m}</li>
  `).join('');
  
  ul.innerHTML = htmlGeral + htmlMaquinas;
  
  ul.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      selectedMachineId = li.dataset.id;
      $('#machineTitle').textContent = li.dataset.id === 'GERAL' ? 'Visão Geral (Todas as Atividades)' : `Atividades: ${li.dataset.id}`;
      if ($('#btnAddActivity')) $('#btnAddActivity').style.display = 'inline-block';
      renderMachineActivities();
      ul.querySelectorAll('li').forEach(x => { x.style.fontWeight = 'normal'; x.style.background = ''; x.style.color = 'var(--text)'; });
      li.style.fontWeight = 'bold';
      li.style.background = 'rgba(212,175,55,0.15)';
      li.style.color = 'var(--primary)';
    });
  });

  if (!selectedMachineId) {
    selectedMachineId = 'GERAL';
  }
  const selLi = document.querySelector(`#machineList li[data-id="${selectedMachineId}"]`);
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
    acts = sourceActs.slice();
  } else {
    acts = sourceActs.filter(r => r.maquina && r.maquina.toUpperCase() === selectedMachineId.toUpperCase());
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
    const descStr = String(descLines[0] || '');
    const descResumo = descStr ? descStr.substring(0, 80) + (descStr.length > 80 || descLines.length > 1 ? '...' : '') : '-';
    
    const matStr = Array.isArray(a.material) ? a.material.join(' | ') : String(a.material || '');
    const matDisplay = matStr ? matStr.substring(0,50) + (matStr.length > 50 ? '...' : '') : '-';
    
    let trHtml = `<tr data-id="${a.id}" style="cursor:pointer;" onclick="abrirDetalhePreventivaPanel('${a.id}')">`;
    
    if (selectedMachineId === 'GERAL') {
      trHtml += `<td>${a.maquina || '-'}</td>`;
    }
    
    trHtml += `
      <td><strong>${a.identificador || '-'}</strong></td>
      <td title="${(descLines.join(' | ')).replace(/"/g, '&quot;')}">${descResumo}</td>
      <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${matStr.replace(/"/g, '&quot;')}">${matDisplay}</td>
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



function setupPlanoPreventivaUI() {
  const machineSelect = $('#planoMachineSelect');
  const monthSelect = $('#planoMesSelect');
  const lineSelect = $('#planoLinhaSelect');
  const btnAplicar = $('#btnAplicarPlano');
  const contextoLabel = $('#planoContextoLabel');
  const countLabel = $('#planoAtividadesCount');
  const modalAtiv = $('#modalEditarAtividade');
  let currentActivities = [];
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
        const descResumo = descStr
          ? descStr.substring(0, 60) + (descStr.length > 60 || descLines.length > 1 ? '...' : '')
          : '-';
        const mat = (a.material || '').replace(/"/g, '&quot;');
        return `<tr>
          <td><strong>${a.identificador || '-'}</strong></td>
          <td title="${descFull}">${descResumo}</td>
          <td style="max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${mat}">${a.material ? String(a.material).split('\n')[0].substring(0, 40) + (String(a.material).length > 40 ? '...' : '') : '-'}</td>
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
    $('#editAtivDescricao').value = descricaoLinhas(a).join('\n');
    $('#editAtivMaterial').value = Array.isArray(a.material) ? a.material.join('\n') : (a.material || '');
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
    const descText = $('#editAtivDescricao').value.trim();
    const descricoes = descText ? descText.split('\n').map((l) => l.trim()).filter(Boolean) : [];

    const atualizado = {
      ...currentActivities[editandoPlanoIdx],
      identificador: $('#editAtivIdentificador').value.trim(),
      maquina: ctx.maquina,
      mes: ctx.mes,
      linha: ctx.linha,
      material: $('#editAtivMaterial').value.trim() ? $('#editAtivMaterial').value.trim().split('\n').filter(Boolean) : [],
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
        descricao: a.descricao || descricaoLinhas(a)[0] || '',
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
      btnAplicar.textContent = '✅ Aplicar Plano à Preventiva';
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

  // Seção tabela (toolbar + tabela de RCs) - Hide for preventiva since it has its own
  $('#secaoTabela')?.classList.toggle('hidden', !['rc', 'consertos', 'compras', 'fabricacao'].includes(name));

  // KPIs e filtros — ocultos nas views especiais (ambos estão dentro do painel-fixo)
  $('#painel-fixo')?.classList.toggle('hidden', isSpecial);


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

function atualizarBotaoEdicao() {
  const btn = $('#btnInlineEdit');
  if (!btn) return;
  if (isInlineEditMode) {
    btn.style.background = 'var(--primary)';
    btn.style.color = '#0f172a';
    btn.style.fontWeight = '700';
    btn.style.borderColor = 'var(--primary)';
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
    try {
      const todosPreventiva = await carregarPreventiva();
      registrosPreventiva = todosPreventiva.filter(r => r.setor !== 'frontend');
      registrosPreventivaFrontend = todosPreventiva.filter(r => r.setor === 'frontend');
    } catch (e) { console.warn('Preventiva table not ready yet', e.message); }
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

  $('#btnNovo').addEventListener('click', () => abrirModal(null));
  $('#btnExport').addEventListener('click', () => exportarExcel(getFiltrados(), viewAtual));
  $('#btnExportPreventiva')?.addEventListener('click', () => exportarExcel(aplicarFiltrosPreventiva(), 'preventiva'));
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
  return registrosPreventiva.filter(r => {
    if (filtrosPreventiva.plano !== 'TODOS' && r.plano_padrao !== filtrosPreventiva.plano) return false;
    if (filtrosPreventiva.status !== 'TODOS' && r.status_auditoria !== filtrosPreventiva.status) return false;
    if (filtrosPreventiva.mes) {
      const rMes = r.mes || 'MARÇO';
      if (rMes !== filtrosPreventiva.mes) return false;
    }
    if (filtrosPreventiva.busca) {
      const q = filtrosPreventiva.busca.toLowerCase();
      const mach = String(r.maquina || '').toLowerCase();
      const iden = String(r.identificador || '').toLowerCase();
      if (!mach.includes(q) && !iden.includes(q)) return false;
    }
    return true;
  });
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

  tbody.innerHTML = filtrados.map(r => `
    <tr>
      <td><strong>${r.identificador || '—'}</strong></td>
      <td>${r.maquina || '—'}</td>
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
  editandoPreventiva = id ? registrosPreventiva.find(r => r.id === id) : {
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
  const html = linhas.map(l => `
    <button class="btn btn-outline" style="text-align: left; justify-content: flex-start;" onclick="selecionarLinhaPlanos('${l}')">Linha ${l.replace('L','')}</button>
  `).join('');
  $('#linhas-list').innerHTML = html;
  
  $('#step-mes').style.display = 'none';
  $('#step-linha').style.display = 'block';
  $('#step-maquina-section').style.display = 'none';
  $('#step-atividades').style.display = 'none';
};

window.selecionarLinhaPlanos = async function(linha) {
  estadoPlanos.linha = linha;
  $('#bc-linha').textContent = `Linha ${linha.replace('L','')}`;
  $('#linha-dashboard-title').textContent = `Dashboard - Linha ${linha.replace('L','')}`;
  
  $('#step-maquina-section').style.display = 'block';
  
  // Atualizar KPIs da linha usando os registros
  const regs = registrosPreventiva.filter(r => r.linha === linha || r.mes === estadoPlanos.mes); // Nota: o DB precisa ter mes e linha no registro. Se não tiver, usar lógica apropriada.
  $('#kpi-linha-atividades').textContent = regs.length || 0;
  
  let totalHH = 0;
  let totalCusto = 0;
  regs.forEach(r => {
    totalHH += (parseFloat(r.hh_mec) || 0) + (parseFloat(r.hh_eletrico) || 0);
    totalCusto += parseFloat(r.previsao_custos) || 0;
  });
  $('#kpi-linha-hh').textContent = totalHH.toFixed(1) + 'h';
  $('#kpi-linha-custo').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCusto);
  // Buscar máquinas para exibir no grid (Apenas do plano de preventiva)
  try {
    let maquinasPrev = opcoesUnicas(registrosPreventiva, 'maquina');
    maquinasPrev = maquinasPrev.filter(m => !['FRONTEND', 'GERAL', 'MAQUINA'].includes(m.toUpperCase()));
    const maquinasArray = Array.from(new Set([...maquinasPrev])).sort();
    
    // Fallback: usar a lista da planilha original
    if (maquinasArray.length === 0) {
      maquinasArray.push('ABASTECIMENTO', 'ACUMULADORES', 'FORNO', 'IMPRESSORA', 'LAVADORA', 'PRENSA', 'QUEIMADORES', 'TORNO', 'VERNIZ INTERNO');
      maquinasArray.sort();
    }

    const html = maquinasArray.map(m => `
      <div class="kpi-card" tabindex="0" onclick="selecionarMaquinaPlanos('${m}', '${m}')" style="cursor:pointer; padding: 1rem; border-color: rgba(255,255,255,0.05); transition: background 0.2s;">
        <div style="font-weight: 500; font-size: 0.95rem;">${m}</div>
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
  
  renderFiltrosPreventiva();
  renderTabelaPreventiva();
};

// Initialize Preventiva Import
initExcelImportPreventiva(getClient(), toast, async () => {
  registrosPreventiva = await carregarPreventiva();
  if (viewAtual === 'preventiva-l06-backend') { renderFiltrosPreventiva(); renderTabelaPreventiva(); }
  if (viewAtual === 'controle-preventiva' || viewAtual === 'preventiva-l06') renderControlePreventiva();
});

// View Detalhes Panel para Preventiva
window.abrirDetalhePreventivaPanel = function(id) {
  const r = registrosPreventiva.find((x) => x.id === id);
  if (!r) return;
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
          <button type="button" class="btn-primary" onclick="abrirFormularioPreventiva('${r.id}'); fecharDrilldown();" style="width: 100%;">✏️ Editar Atividade</button>
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
  const html = linhas.map(l =>
    `<button class="btn btn-outline" style="text-align:left; justify-content:flex-start;" onclick="selecionarLinhaPlanosFrontend('${l}')">Linha ${l.replace('L', '')}</button>`
  ).join('');
  const el = $('#linhas-list-fe');
  if (el) el.innerHTML = html;
  $('#step-mes-fe').style.display = 'none';
  $('#step-linha-fe').style.display = 'block';
  $('#step-maquina-section-fe').style.display = 'none';
  $('#step-atividades-fe').style.display = 'none';
};

window.selecionarLinhaPlanosFrontend = function(linha) {
  estadoPlanosFrontend.linha = linha;
  const linhaLabel = `Linha ${linha.replace('L', '')}`;
  $('#bc-linha-fe').textContent = linhaLabel;
  const titleEl = $('#linha-dashboard-title-fe');
  if (titleEl) titleEl.textContent = `Dashboard — ${linhaLabel} · Front-end`;

  $('#step-maquina-section-fe').style.display = 'block';

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
  renderTabelaPreventivaFE();
};

function aplicarFiltrosFrontend() {
  return registrosPreventivaFrontend.filter(r => {
    if (filtrosPreventivaFE.status !== 'TODOS' && r.status_auditoria !== filtrosPreventivaFE.status) return false;
    if (filtrosPreventivaFE.busca) {
      const q = filtrosPreventivaFE.busca.toLowerCase();
      if (!String(r.maquina || '').toLowerCase().includes(q) &&
          !String(r.identificador || '').toLowerCase().includes(q) &&
          !String(r.descricao || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderTabelaPreventivaFE() {
  const tbody = $('#tabelaPreventivaFE');
  if (!tbody) return;
  const filtrados = aplicarFiltrosFrontend();
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">Nenhuma atividade Front-end encontrada</td></tr>';
    return;
  }
  tbody.innerHTML = filtrados.map((r, i) => `
    <tr>
      <td><strong>${i + 1}</strong></td>
      <td>${r.maquina || '—'}</td>
      <td style="max-width:280px; white-space:normal; line-height:1.4;">${(r.atividades_descricoes?.[0] || r.descricao || '—').slice(0, 100)}${(r.atividades_descricoes?.[0] || r.descricao || '').length > 100 ? '…' : ''}</td>
      <td>${r.duracao_horas != null && r.duracao_horas !== '' ? r.duracao_horas + 'h' : '—'}</td>
      <td>${r.hh_mec || '—'}</td>
      <td>${r.hh_eletrico || '—'}</td>
      <td>${r.hh_lub || '—'}</td>
      <td>${r.frequencia_meses ? r.frequencia_meses + ' meses' : '—'}</td>
      <td>${r.sugestao || r.resp_fabrica || '—'}</td>
      <td><span class="badge ${r.status_auditoria === 'FINALIZADO' ? 'badge-success' : r.status_auditoria ? 'badge-warning' : ''}">${r.status_auditoria || '—'}</span></td>
      <td>
        <button type="button" class="btn-icon" onclick="abrirDetalhePreventivaFEPanel('${r.id}')" title="Ver Detalhes" style="background:var(--primary);color:#000;padding:0.4rem 0.8rem;border-radius:6px;font-size:0.8rem;width:auto;font-family:inherit;">Ver</button>
        <button type="button" class="btn-icon" onclick="abrirFormularioPreventivaFE('${r.id}')" title="Editar">✏️</button>
      </td>
    </tr>
  `).join('');
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
let editandoPreventivaFE = null;

window.abrirFormularioPreventivaFE = function(id) {
  editandoPreventivaFE = id
    ? registrosPreventivaFrontend.find(r => r.id === id)
    : { identificador: '', maquina: estadoPlanosFrontend.maquina || '', descricao: '',
        atividades_descricoes: [], duracao_horas: 0, hh_mec: 0, hh_eletrico: 0, hh_lub: 0,
        frequencia_meses: null, sugestao: '', status_auditoria: '', setor: 'frontend', area_producao: 'FRONT-END' };
  if (!editandoPreventivaFE) return;
  const f = $('#formEditarAtividadeFE');
  if (!f) return;
  $('#editAtivIdFE').value = editandoPreventivaFE.id || '';
  $('#editAtivIdentificadorFE').value = editandoPreventivaFE.identificador || '';
  $('#editAtivMaquinaFE').value = editandoPreventivaFE.maquina || '';
  $('#editAtivDescricaoFE').value = (editandoPreventivaFE.atividades_descricoes?.[0] || editandoPreventivaFE.descricao || '');
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
  const descricao = $('#editAtivDescricaoFE').value.trim();
  const payload = {
    ...editandoPreventivaFE,
    identificador: $('#editAtivIdentificadorFE').value.trim(),
    maquina: $('#editAtivMaquinaFE').value.trim(),
    descricao,
    atividades_descricoes: descricao ? [descricao] : [],
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
  try {
    await salvarPreventiva(payload);
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
  const r = registrosPreventivaFrontend.find(x => x.id === id);
  if (!r) return;
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
  document.getElementById('drillLista').innerHTML = `
    <article class="drill-item" style="padding:1.5rem;background:transparent;border:none;">
      <h4 style="margin-top:0;color:var(--text);margin-bottom:1rem;">Descrição da Atividade</h4>
      <div style="background:var(--bg);padding:1rem;border-radius:8px;border:1px solid var(--border);line-height:1.6;">${desc}</div>
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
  const labelEl = $('#planoAtividadesLabelFE');

  if (!machineSelect || !btnAplicar || !table) return;

  let currentActivitiesFE = [];

  const getContextoFE = () => ({
    maquina: machineSelect.value,
    mes: monthSelect.value,
    linha: lineSelect.value,
  });
  const contextoCompletoFE = () => {
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
    tbody.innerHTML = currentActivitiesFE.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${a.maquina || '—'}</td>
        <td style="max-width:260px;white-space:normal;line-height:1.4;">${(a.atividades_descricoes?.[0] || a.descricao || '—').slice(0, 100)}</td>
        <td>${a.duracao_horas ?? '—'}</td>
        <td>${a.hh_mec || '—'}</td>
        <td>${a.hh_eletrico || '—'}</td>
        <td>${a.hh_lub || '—'}</td>
        <td>${a.frequencia_meses ? a.frequencia_meses + ' m' : '—'}</td>
        <td>${a.sugestao || a.resp_fabrica || '—'}</td>
        <td><span class="badge ${a.status_auditoria === 'FINALIZADO' ? 'badge-success' : a.status_auditoria ? 'badge-warning' : ''}">${a.status_auditoria || '—'}</span></td>
        <td><button type="button" class="btn-icon" onclick="abrirFormularioPreventivaFE('${a.id}')" title="Editar">✏️</button></td>
      </tr>
    `).join('');
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
    if (btnAplicar) btnAplicar.disabled = !contextoCompletoFE() || currentActivitiesFE.length === 0;
  };

  const loadPlanoMachinesFE = () => {
    let maquinas = [...new Set(registrosPreventivaFrontend.map(r => r.maquina).filter(Boolean))].sort();
    if (!maquinas.length) maquinas = ['ESMALTADEIRA', 'IMPRESSORA', 'VERNIZ EXTERNO', 'DECORAÇÃO', 'CONIFICADORA', 'EMBALADEIRA'];
    machineSelect.innerHTML = '<option value="">Selecione a máquina...</option>' +
      maquinas.map(m => `<option value="${m}">${m}</option>`).join('');
  };
  loadPlanoMachinesFE();

  [machineSelect, monthSelect, lineSelect].forEach(el => el?.addEventListener('change', carregarAtividadesPlanoFE));

  btnAplicar?.addEventListener('click', async () => {
    const ctx = getContextoFE();
    if (!contextoCompletoFE()) { toast('Selecione máquina, mês e linha antes de aplicar.', 'warning'); return; }
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
        descricao: a.atividades_descricoes?.[0] || a.descricao || '',
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
      btnAplicar.disabled = !contextoCompletoFE() || currentActivitiesFE.length === 0;
      btnAplicar.textContent = '✅ Aplicar Plano Front-end';
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
            descricao: descText,
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
