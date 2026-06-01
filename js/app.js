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

import { initExcelImportPreventiva } from './import_excel_preventiva.js?v=1';
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
  getMachines().then(list => {
    machines = list;
    const ul = $('#machineList');
    if (!ul) return;
    ul.innerHTML = list.map(m => `
      <li data-id="${m.id}" style="cursor:pointer; padding:0.25rem 0;">${m.nome || m.id}
      </li>`).join('');
    ul.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        selectedMachineId = li.dataset.id;
        $('#machineTitle').textContent = `Atividades da máquina: ${li.textContent}`;
        $('#btnAddActivity').style.display = 'inline-block';
        renderMachineActivities();
        // highlight selection
        ul.querySelectorAll('li').forEach(x => x.style.fontWeight = 'normal');
        li.style.fontWeight = 'bold';
      });
    });
  }).catch(err => {
    console.error('Erro ao carregar máquinas', err);
    toast('Erro ao carregar máquinas', 'error');
  });
}

function renderMachineActivities() {
  if (!selectedMachineId) return;
  getMachineActivities(selectedMachineId).then(acts => {
    const table = $('#machineActivitiesTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    // Define simple columns
    const cols = [
      { key: 'ordem', label: 'Ordem' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'duracao_horas', label: 'Duração (h)' },
      { key: 'hh_mec', label: 'HH Mec' },
      { key: 'hh_eletrico', label: 'HH Elétrico' },
      { key: 'status_auditoria', label: 'Status' }
    ];
    thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    tbody.innerHTML = acts.map(a => `<tr data-id="${a.id}">${cols.map(c => `<td>${a[c.key] ?? ''}</td>`).join('')}</tr>`).join('');
    // allow edit on double click (simple prompt)
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('dblclick', async () => {
        const id = row.dataset.id;
        const activity = acts.find(x => x.id === id);
        const novaDesc = prompt('Nova descrição', activity.descricao || '');
        if (novaDesc !== null) {
          const updated = { ...activity, descricao: novaDesc };
          // reuse createMachineActivity for upsert (Supabase will update if id present)
          await createMachineActivity(selectedMachineId, updated);
          renderMachineActivities();
        }
      });
    });
  }).catch(err => {
    console.error('Erro ao carregar atividades', err);
    toast('Erro ao carregar atividades', 'error');
  });
}

function setupPorMaquinaUI() {
  // Button handlers
  $('#btnAddMachine')?.addEventListener('click', async () => {
    const nome = prompt('Nome da nova máquina');
    if (!nome) return;
    try {
      await createMachine({ nome });
      renderMachineList();
      toast('Máquina criada', 'success');
    } catch (e) {
      toast('Erro ao criar máquina: ' + e.message, 'error');
    }
  });
  $('#btnAddActivity')?.addEventListener('click', async () => {
    if (!selectedMachineId) {
      toast('Selecione uma máquina primeiro.', 'info');
      return;
    }
    const descricao = prompt('Descrição da atividade');
    if (!descricao) return;
    const ordem = parseInt(prompt('Ordem (número)') || '0', 10);
    const duracao = parseFloat(prompt('Duração em horas') || '0');
    const hhMec = parseFloat(prompt('HH Mec') || '0');
    const hhEle = parseFloat(prompt('HH Elétrico') || '0');
    const status = prompt('Status (ex.: PENDENTE, CONCLUIDO)', 'PENDENTE');
    const activity = { ordem, descricao, duracao_horas: duracao, hh_mec: hhMec, hh_eletrico: hhEle, status_auditoria: status };
    try {
      await createMachineActivity(selectedMachineId, activity);
      renderMachineActivities();
      toast('Atividade adicionada', 'success');
    } catch (e) {
      toast('Erro ao criar atividade: ' + e.message, 'error');
    }
  });
}

function setupPlanoPreventivaUI() {
  const machineSelect = $('#planoMachineSelect');
  const monthSelect = $('#planoMesSelect');
  const lineSelect = $('#planoLinhaSelect');
  const btnAplicar = $('#btnAplicarPlano');
  let currentActivities = [];

  // Carregar máquinas ao abrir a view
  const loadPlanoMachines = () => {
    getMachines().then(list => {
      if (!machineSelect) return;
      // Manter a primeira option
      machineSelect.innerHTML = '<option value="">Selecione a máquina...</option>' + 
        list.map(m => `<option value="${m.id}">${m.nome || m.id}</option>`).join('');
    }).catch(e => console.error(e));
  };
  loadPlanoMachines();

  machineSelect?.addEventListener('change', async (e) => {
    const id = e.target.value;
    const tbody = $('#planoActivitiesTable tbody');
    if (!id) {
      if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted);">Selecione uma máquina para visualizar as atividades padrão.</td></tr>';
      currentActivities = [];
      return;
    }
    try {
      currentActivities = await getMachineActivities(id);
      if(!tbody) return;
      if(currentActivities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted);">Nenhuma atividade cadastrada para esta máquina.</td></tr>';
      } else {
        tbody.innerHTML = currentActivities.map(a => `
          <tr>
            <td>${a.ordem || ''}</td>
            <td>${a.descricao || ''}</td>
            <td>${a.duracao_horas || ''}</td>
            <td>${a.hh_mec || ''}</td>
            <td>${a.hh_eletrico || ''}</td>
            <td><span class="badge ${a.status_auditoria ? 'badge-warning' : ''}">${a.status_auditoria || 'PENDENTE'}</span></td>
          </tr>
        `).join('');
      }
    } catch(err) {
      toast('Erro ao carregar atividades: ' + err.message, 'error');
    }
  });

  btnAplicar?.addEventListener('click', async () => {
    const machineId = machineSelect.value;
    const mes = monthSelect.value;
    const linha = lineSelect.value; // Por enquanto sempre L06

    if(!machineId || !mes || !linha) {
      toast('Por favor, selecione a máquina, o mês e a linha.', 'warning');
      return;
    }
    if(currentActivities.length === 0) {
      toast('A máquina selecionada não possui atividades padrão.', 'warning');
      return;
    }

    try {
      btnAplicar.disabled = true;
      btnAplicar.textContent = 'Aplicando...';
      const mName = machineSelect.options[machineSelect.selectedIndex].text;
      
      let count = 0;
      for (const act of currentActivities) {
        const payload = {
          identificador: `P-${mes.substring(0,3)}-${Date.now().toString().slice(-4)}${count++}`,
          maquina: mName,
          material: '',
          plano_padrao: 'S',
          mes: mes,
          linha: linha,
          duracao_horas: act.duracao_horas || 0,
          hh_mec: act.hh_mec || 0,
          hh_eletrico: act.hh_eletrico || 0,
          resp_fabrica: '',
          resp_manutencao: '',
          status_auditoria: act.status_auditoria || 'PENDENTE',
          previsao_custos: 0,
          atividades_descricoes: act.descricao ? [act.descricao] : [],
          programacao: []
        };
        await salvarPreventiva(payload);
      }
      toast('Plano aplicado com sucesso à Preventiva no mês selecionado!', 'success');
      try { registrosPreventiva = await carregarPreventiva(); } catch(e){}
    } catch(err) {
      toast('Erro ao aplicar plano: ' + err.message, 'error');
    } finally {
      btnAplicar.disabled = false;
      btnAplicar.textContent = 'Aplicar Plano à Preventiva';
    }
  });
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
  document.querySelectorAll('nav.tabs button, .nav-item').forEach((b) => b.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  document.querySelectorAll(`[data-tab="${name}"]`).forEach((el) => el.classList.add('active'));

  const crud = ['rc', 'consertos', 'compras', 'fabricacao'].includes(name);
  const isDash = name === 'dashboard';
  const isSpecial = ['fornecedores', 'calendario', 'planos-manutencao', 'por-maquina', 'plano-preventiva'].includes(name);

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
  }

  const titles = {
    dashboard: 'Visão Geral',
    dashboard: 'Visão Geral',
    rc: 'Controle Global',
    consertos: 'Consertos',
    compras: 'Compras',
    fabricacao: 'Fabricação',
    fornecedores: 'SLA Fornecedores',
    calendario: 'Calendário',
    'planos-manutencao': 'Planos de Manutenção',
    'por-maquina': 'Máquinas & Templates',
    'plano-preventiva': 'Gerador de Planos',
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
    try { registrosPreventiva = await carregarPreventiva(); } catch (e) { console.warn("Preventiva table not ready yet"); }
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

  setupPorMaquinaUI();
  setupPlanoPreventivaUI();

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
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.abrirFormularioPreventiva('${r.id}')">Editar</button>
      </td>
    </tr>
  `).join('');
}

window.abrirFormularioPreventiva = function(id) {
  editandoPreventiva = id ? registrosPreventiva.find(r => r.id === id) : {
    identificador: '', maquina: '', material: '', plano_padrao: 'S', duracao_horas: 0, hh_mec: 0, hh_eletrico: 0,
    resp_fabrica: '', resp_manutencao: '', status_auditoria: '', previsao_custos: 0, atividades_descricoes: [], programacao: []
  };

  if (!editandoPreventiva) return;

  const f = $('#formRegistroPreventiva');
  f.id.value = editandoPreventiva.id || '';
  f.identificador.value = editandoPreventiva.identificador || '';
  f.maquina.value = editandoPreventiva.maquina || '';
  f.material.value = editandoPreventiva.material || '';
  f.plano_padrao.value = editandoPreventiva.plano_padrao || 'S';
  f.duracao_horas.value = editandoPreventiva.duracao_horas || '';
  f.hh_mec.value = editandoPreventiva.hh_mec || '';
  f.hh_eletrico.value = editandoPreventiva.hh_eletrico || '';
  f.resp_fabrica.value = editandoPreventiva.resp_fabrica || '';
  f.resp_manutencao.value = editandoPreventiva.resp_manutencao || '';
  f.status_auditoria.value = editandoPreventiva.status_auditoria || '';
  f.previsao_custos.value = editandoPreventiva.previsao_custos || '';

  renderDescricoesPreventiva();
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
    material: f.material.value,
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
  const regs = state.preventivaRegistros.filter(r => r.linha === linha || r.mes === estadoPlanos.mes); // Nota: o DB precisa ter mes e linha no registro. Se não tiver, usar lógica apropriada.
  $('#kpi-linha-atividades').textContent = regs.length || 0;
  
  let totalHH = 0;
  let totalCusto = 0;
  regs.forEach(r => {
    totalHH += (parseFloat(r.hh_mec) || 0) + (parseFloat(r.hh_eletrico) || 0);
    totalCusto += parseFloat(r.previsao_custos) || 0;
  });
  $('#kpi-linha-hh').textContent = totalHH.toFixed(1) + 'h';
  $('#kpi-linha-custo').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCusto);
  
  // Buscar máquinas para exibir no grid
  try {
    const db = await import('./db.js');
    const maquinas = await db.getMachines();
    const html = maquinas.map(m => `
      <div class="kpi-card" tabindex="0" onclick="selecionarMaquinaPlanos('${m.id}', '${m.nome}')" style="cursor:pointer; padding: 1rem; border-color: rgba(255,255,255,0.05); transition: background 0.2s;">
        <div style="font-weight: 500; font-size: 0.95rem;">${m.nome}</div>
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
