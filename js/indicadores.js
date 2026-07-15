import { carregarAlbuns, salvarAlbum, excluirAlbum, carregarEvidenciasDoAlbum, salvarEvidencia, excluirEvidencia } from './db.js';
import { renderConfiabilidadeCharts, destroyConfiabCharts } from './charts.js?v=1002';

export async function initIndicadores() {
  const btnUploadKPI = document.getElementById('btnUploadKPI');
  const fileImportKPI = document.getElementById('fileImportKPI');
  if (btnUploadKPI && fileImportKPI) {
    btnUploadKPI.addEventListener('click', () => fileImportKPI.click());
    fileImportKPI.addEventListener('change', handleExcelUpload);
  }

  // TABS LOGIC
  document.querySelectorAll('.kpi-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.kpi-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderBottomColor = 'transparent';
        b.style.color = 'var(--text-secondary)';
      });
      btn.classList.add('active');
      btn.style.borderBottomColor = 'var(--gold)';
      btn.style.color = 'var(--text-primary)';
      
      const tabId = btn.getAttribute('data-kpitab');
      document.querySelectorAll('.kpi-subview').forEach(v => v.style.display = 'none');
      document.getElementById('kpi-view-' + tabId).style.display = 'flex';
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });
  });

  // CHART TOGGLES (Global)
  document.getElementById('btnKpiSemana')?.addEventListener('click', () => toggleEvolucao('semana'));
  document.getElementById('btnKpiMes')?.addEventListener('click', () => toggleEvolucao('mes'));
  document.getElementById('btnKpiDiario')?.addEventListener('click', () => toggleEvolucao('diario'));

  document.getElementById('selectKpiSemanaOfensor')?.addEventListener('change', (e) => {
    renderKpiOfensores(e.target.value);
  });

  document.getElementById('selectKpiLinha')?.addEventListener('change', (e) => {
    renderViewLinha(e.target.value);
  });

  // MODAL EDIT MANUAIS
  const btnEditKPI = document.getElementById('btnEditKPI');
  const modalEdit = document.getElementById('modal-edit-kpi');
  if (btnEditKPI && modalEdit) {
    btnEditKPI.addEventListener('click', abrirModalEdicao);
    document.getElementById('btnCloseEditKpi').addEventListener('click', () => modalEdit.style.display = 'none');
    document.getElementById('btnSaveKpiManual').addEventListener('click', salvarDadosManuais);
  }

  window.abrirModalEdicaoKPI = abrirModalEdicao;
  window.salvarDadosManuaisKPI = salvarDadosManuais;
  window.fecharModalEdicaoKPI = () => { if(modalEdit) modalEdit.style.display = 'none'; };

  // ALBUNS & EVIDENCIAS LOGIC
  const selectKpiMesEvidencia = document.getElementById('selectKpiMesEvidencia');
  if (selectKpiMesEvidencia) {
    const dataAtual = new Date();
    const mesesStr = [];
    for(let i=0; i<6; i++) {
      let d = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - i, 1);
      let m = String(d.getMonth() + 1).padStart(2, '0');
      let y = d.getFullYear();
      mesesStr.push(`${m}/${y}`);
    }
    selectKpiMesEvidencia.innerHTML = mesesStr.map(m => `<option value="${m}">${m}</option>`).join('');
    
    selectKpiMesEvidencia.addEventListener('change', () => {
      document.getElementById('kpi-view-albuns').style.display = 'block';
      document.getElementById('kpi-view-evidencias-galeria').style.display = 'none';
      renderAlbuns(selectKpiMesEvidencia.value);
    });
    
    // Album listeners
    document.getElementById('btnNovoAlbum')?.addEventListener('click', () => abrirModalAlbum(null, selectKpiMesEvidencia.value));
    document.getElementById('btnCloseModalAlbum')?.addEventListener('click', fecharModalAlbum);
    document.getElementById('btnCancelarAlbum')?.addEventListener('click', fecharModalAlbum);
    document.getElementById('btnSalvarAlbum')?.addEventListener('click', salvarAlbumForm);
    
    document.getElementById('btnVoltarAlbuns')?.addEventListener('click', () => {
      document.getElementById('kpi-view-evidencias-galeria').style.display = 'none';
      document.getElementById('kpi-view-albuns').style.display = 'block';
      renderAlbuns(selectKpiMesEvidencia.value);
    });

    // Evidence listeners
    document.getElementById('btnNovaEvidencia')?.addEventListener('click', () => abrirModalEvidencia(null, currentAlbumId));
    document.getElementById('btnCloseModalEvidencia')?.addEventListener('click', fecharModalEvidencia);
    document.getElementById('btnCancelarEvidencia')?.addEventListener('click', fecharModalEvidencia);
    document.getElementById('btnSalvarEvidencia')?.addEventListener('click', salvarEvidenciaForm);
    
    // Presentation listeners
    document.getElementById('btnApresentacao')?.addEventListener('click', () => abrirApresentacao(currentAlbumId));
    document.getElementById('btnFecharApresentacao')?.addEventListener('click', fecharApresentacao);
    document.getElementById('btnApresentacaoNext')?.addEventListener('click', nextSlide);
    document.getElementById('btnApresentacaoPrev')?.addEventListener('click', prevSlide);
    
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('modal-apresentacao');
      if (modal && modal.style.display === 'flex') {
        if (e.key === 'ArrowRight') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'Escape') fecharApresentacao();
      }
    });

    // Initial render
    setTimeout(() => renderAlbuns(selectKpiMesEvidencia.value), 500);
  }

  await carregarEAtualizarPainel();
}

async function handleExcelUpload(event) {
  // Existing logic...
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      Swal.fire({ title: 'Processando...', text: 'Extraindo dados da planilha', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      await extrairBaseDeDados(workbook);
      await extrairPlanilha2(workbook);
      await extrairPlanoAcoes(workbook);
      await extrairRelatorioParadas(workbook);
      await carregarEAtualizarPainel();
      Swal.fire('Sucesso!', 'Indicadores atualizados com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      Swal.fire('Erro', 'Falha: ' + error.message, 'error');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

async function apiRequest(table, method, body = null) {
  const url = window.__ENV?.SUPABASE_URL ? `${window.__ENV.SUPABASE_URL}/rest/v1/${table}` : `http://localhost:8080/rest/v1/${table}`;
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  if (method === 'GET' || method === 'POST') return await res.json();
  return null;
}

// ... EXTRAÇÃO EXCEL ...
async function extrairBaseDeDados(workbook) {
  const sheetName = "Base de dados";
  if (!workbook.Sheets[sheetName]) return;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  let records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const semana = row[1];
    const bdSemana = parseFloat(row[2]);
    const targetSemana = parseFloat(row[11]);
    if (semana && String(semana).startsWith('W') && !isNaN(bdSemana)) {
      records.push({ periodo_tipo: 'semana', periodo_nome: semana, breakdown_real: bdSemana, target_meta: isNaN(targetSemana) ? null : targetSemana });
    }
    const mes = row[9];
    const bdMes = parseFloat(row[10]);
    if (mes && typeof mes === 'string' && mes.trim() !== '' && !isNaN(bdMes)) {
      records.push({ periodo_tipo: 'mes', periodo_nome: mes, breakdown_real: bdMes, target_meta: isNaN(targetSemana) ? null : targetSemana });
    }
  }
  if (records.length > 0) {
    await apiRequest('kpi_breakdowns', 'DELETE');
    await apiRequest('kpi_breakdowns', 'POST', records);
  }
}

async function extrairPlanilha2(workbook) {
  const sheetName = "Planilha2";
  if (!workbook.Sheets[sheetName]) return;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  let records = [];
  let currentWeek = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const col1 = row[1];
    if (!col1) continue;
    if (String(col1).startsWith('W') && !isNaN(String(col1).replace('W',''))) {
      currentWeek = col1; continue;
    }
    if (currentWeek && col1 !== 'Total') {
      const maquina = col1;
      const tMec = parseFloat(row[2]) || 0;
      const tTot = parseFloat(row[4]) || 0;
      const tDisp = parseFloat(row[5]) || 0;
      const bd = parseFloat(row[6]) || 0;
      if (tTot > 0 || bd > 0) records.push({ semana: currentWeek, maquina, tempo_mecanico_min: tMec, tempo_total_min: tTot, tempo_disponivel_min: tDisp, breakdown_pct: bd });
    }
  }
  if (records.length > 0) {
    await apiRequest('kpi_maquinas_ofensoras', 'DELETE');
    for (let r of records) {
        try { await apiRequest('kpi_maquinas_ofensoras', 'POST', [r]); } catch(e){}
    }
  }
}

async function extrairPlanoAcoes(workbook) {
  let sheet = workbook.Sheets["Plano de ações"] || workbook.Sheets["Plano de a\u00e7\u00f5es"];
  if (!sheet) return;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[18] || String(row[18]) === '-') continue;
    const projeto = row[18];
    if (projeto && projeto !== 'Qual projeto?') {
      records.push({ data_str: row[1] ? String(row[1]) : '', projeto, responsavel: row[19] || 'N/A', status_col: 'Aberto', ref_id: row[0] ? String(row[0]) : '' });
    }
  }
  if (records.length > 0) {
    await apiRequest('kpi_plano_acoes', 'DELETE');
    await apiRequest('kpi_plano_acoes', 'POST', records);
  }
}

async function extrairRelatorioParadas(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return;

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, dateNF: 'yyyy-mm-dd' });
  if (!rawRows || rawRows.length === 0) return;
  
  let headerRowIndex = -1;
  let headers = [];
  
  // Procura pela linha de cabeçalho correta nas primeiras 20 linhas
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const row = rawRows[i];
    if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().trim() === 'paradas')) {
      headerRowIndex = i;
      headers = row.map(cell => cell ? String(cell).trim().toLowerCase() : '');
      break;
    }
  }

  if (headerRowIndex === -1) return; // Não encontrou o cabeçalho 'Paradas', provavelmente não é o relatório correto

  let payloadRows = [];
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || !row.length) continue;
    
    const norm = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        norm[headers[j]] = row[j];
        if (row[j]) hasData = true;
      }
    }
    
    if (!hasData || (!norm['paradas'] && !norm['data'])) continue;

    payloadRows.push({
      parada: norm['paradas'] || '',
      grupo: norm['grupos de paradas'] || norm['grupo de paradas'] || '',
      data: norm['data'] || '',
      inicio: norm['início'] || norm['inicio'] || '',
      fim: norm['fim'] || '',
      duracao: norm['duração'] || norm['duracao'] || '00:00:00'
    });
  }
  
  if (payloadRows.length === 0) return;

  try {
    const res = await fetch('/api/import/paradas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payloadRows, ano: new Date().getFullYear(), mes: null })
    });
    if (!res.ok) throw new Error('Falha na resposta da importação de paradas');
  } catch(e) {
    console.error('Erro ao chamar /api/import/paradas:', e);
  }
}

// ---- DATA FETCHING ----
let chartEvolucaoInstance = null;
let chartOfensoresInstance = null;
let kpiDataBreakdowns = [];
let kpiDataOfensores = [];
let kpiDataLinhas = [];
let kpiDataDiario = [];
let kpiDataCompliance = [];
let kpiDataMtbf = [];
let currentAlbumId = null;
let presentationEvidencias = [];
let currentSlideIndex = 0;
async function carregarEAtualizarPainel() {
  try {
    const [
      resBreakdowns,
      resOfensores,
      resAcoes,
      resLinhas,
      resDiario,
      resCompliance,
      resMtbf
    ] = await Promise.all([
      apiRequest('kpi_breakdowns', 'GET'),
      apiRequest('kpi_maquinas_ofensoras', 'GET'),
      apiRequest('kpi_plano_acoes', 'GET'),
      apiRequest('kpi_linhas', 'GET'),
      apiRequest('kpi_diario', 'GET'),
      apiRequest('kpi_compliance', 'GET'),
      apiRequest('kpi_mtbf', 'GET')
    ]);

    kpiDataBreakdowns = resBreakdowns || [];
    kpiDataOfensores = resOfensores || [];
    const kpiAcoes = resAcoes || [];
    
    kpiDataLinhas = resLinhas || [];
    kpiDataDiario = resDiario || [];
    kpiDataCompliance = resCompliance || [];
    kpiDataMtbf = resMtbf || [];
    
    atualizarCardsFixos();
    popularSelectSemanas();
    
    toggleEvolucao('semana');
    
    const selectSemana = document.getElementById('selectKpiSemanaOfensor');
    if (selectSemana && selectSemana.options.length > 0) {
      selectSemana.value = selectSemana.options[selectSemana.options.length - 1].value;
      renderKpiOfensores(selectSemana.value);
    }
    
    renderTabelaAcoes(kpiAcoes);
    renderCompliance();
    
    const selectLinha = document.getElementById('selectKpiLinha');
    if (selectLinha) renderViewLinha(selectLinha.value);
    
  } catch (e) {
    console.warn("Erro ao buscar KPIs:", e);
  }
}

async function atualizarCardsFixos() {
  const ano = new Date().getFullYear();
  try {
    const respSem = await fetch(`/api/kpi/confiabilidade?periodo_tipo=SEMANA&ano=${ano}&linha=TODAS`);
    const respMes = await fetch(`/api/kpi/confiabilidade?periodo_tipo=MES&ano=${ano}&linha=TODAS`);
    
    let indispSem = '--';
    let indispMes = '--';

    if (respSem.ok) {
        const dados = await respSem.json();
        if (dados && dados.length > 0) {
            indispSem = dados[dados.length - 1].indisponibilidade_pct.toFixed(2) + '%';
        }
    }
    if (respMes.ok) {
        const dados = await respMes.json();
        if (dados && dados.length > 0) {
            indispMes = dados[dados.length - 1].indisponibilidade_pct.toFixed(2) + '%';
        }
    }

    const kpiSemEl = document.getElementById('kpiBreakdownSemana');
    if (kpiSemEl) kpiSemEl.textContent = indispSem;
    
    const kpiMesEl = document.getElementById('kpiBreakdownMes');
    if (kpiMesEl) kpiMesEl.textContent = indispMes;

    const metaIndisp = (Object.values(_confiabMetas)[0] || {}).meta_indisponibilidade_pct || 8;
    const kpiMetaEl = document.getElementById('kpiBreakdownMeta');
    if (kpiMetaEl) kpiMetaEl.textContent = metaIndisp.toFixed(2) + '%';
  } catch(e) {
    console.error("Erro atualizarCardsFixos:", e);
  }
}

function renderCompliance() {
  const dict = {};
  kpiDataCompliance.forEach(c => dict[c.tipo] = c.valor_pct);
  if(dict['PM']) document.getElementById('kpiCompPM').textContent = dict['PM'].toFixed(1) + '%';
  if(dict['LUB']) document.getElementById('kpiCompLubri').textContent = dict['LUB'].toFixed(1) + '%';
  if(dict['PREV']) document.getElementById('kpiCompPrev').textContent = dict['PREV'].toFixed(1) + '%';
  if(dict['ESPEC']) document.getElementById('kpiCompEspec').textContent = dict['ESPEC'].toFixed(1) + '%';
}

function popularSelectSemanas() {
  const select = document.getElementById('selectKpiSemanaOfensor');
  if (!select) return;
  select.innerHTML = '';
  const semanas = [...new Set(kpiDataOfensores.map(d => d.semana))];
  semanas.forEach(sem => {
    const opt = document.createElement('option');
    opt.value = sem;
    opt.textContent = sem;
    select.appendChild(opt);
  });
}

const formatDataView = (opt) => {
  let table = '<div style="background:transparent; padding:0; width:100%; height:100%; overflow:auto;"><table style="width:100%;text-align:left;border-collapse:collapse;font-size:0.85rem;"><tbody>';
  const series = opt.series;
  if (opt.xAxis && opt.xAxis.length > 0 && opt.xAxis[0].data) {
    const axisData = opt.xAxis[0].data;
    table += '<tr><th style="padding:8px;border-bottom:1px solid var(--border,#334155);">Categoria</th>';
    series.forEach(s => { table += `<th style="padding:8px;border-bottom:1px solid var(--border,#334155);">${s.name || 'Valor'}</th>`; });
    table += '</tr>';
    for (let i = 0; i < axisData.length; i++) {
      table += `<tr><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${axisData[i]}</td>`;
      series.forEach(s => {
        let val = s.data[i];
        if (val && typeof val === 'object') val = val.value;
        table += `<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${val !== null ? val : '—'}</td>`;
      });
      table += '</tr>';
    }
  } else if (opt.yAxis && opt.yAxis.length > 0 && opt.yAxis[0].data) {
    const axisData = opt.yAxis[0].data;
    table += '<tr><th style="padding:8px;border-bottom:1px solid var(--border,#334155);">Categoria</th>';
    series.forEach(s => { table += `<th style="padding:8px;border-bottom:1px solid var(--border,#334155);">${s.name || 'Valor'}</th>`; });
    table += '</tr>';
    for (let i = 0; i < axisData.length; i++) {
      table += `<tr><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${axisData[i]}</td>`;
      series.forEach(s => {
        let val = s.data[i];
        if (val && typeof val === 'object') val = val.value;
        table += `<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${val !== null ? val : '—'}</td>`;
      });
      table += '</tr>';
    }
  }
  table += '</tbody></table></div>';
  return table;
};

function toggleEvolucao(tipo) {
  const btnSemana = document.getElementById('btnKpiSemana');
  const btnMes = document.getElementById('btnKpiMes');
  const btnDiario = document.getElementById('btnKpiDiario');

  if (btnSemana) btnSemana.style.background = (tipo==='semana') ? 'var(--bg3)' : 'transparent';
  if (btnMes) btnMes.style.background = (tipo==='mes') ? 'var(--bg3)' : 'transparent';
  if (btnDiario) btnDiario.style.background = (tipo==='diario') ? 'var(--bg3)' : 'transparent';
  
  if (btnSemana) btnSemana.style.color = (tipo==='semana') ? 'var(--text-primary)' : 'var(--text-secondary)';
  if (btnMes) btnMes.style.color = (tipo==='mes') ? 'var(--text-primary)' : 'var(--text-secondary)';
  if (btnDiario) btnDiario.style.color = (tipo==='diario') ? 'var(--text-primary)' : 'var(--text-secondary)';
  
  if (tipo === 'diario') return; // Not supported for Indisponibilidade graph yet
  
  // Sync state with Confiabilidade backend logic
  _confiabPeriodo = (tipo === 'semana') ? 'SEMANA' : 'MES';
  
  // Update Confiabilidade tab buttons if they exist
  document.querySelectorAll('.btn-toggle-confiab').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-secondary)';
      b.style.fontWeight = '400';
  });
  const btnConf = document.getElementById(_confiabPeriodo === 'MES' ? 'btnConfiabMes' : 'btnConfiabSem');
  if (btnConf) {
      btnConf.style.background = 'var(--gold)';
      btnConf.style.color = '#000';
      btnConf.style.fontWeight = '600';
  }

  // Load Confiabilidade data which updates chartConfiabIndisp automatically!
  carregarConfiabilidade();
}

function renderKpiOfensores(semana) {
  const ctxEl = document.getElementById('chartKpiOfensores');
  if (!ctxEl) return;
  
  let data = kpiDataOfensores.filter(d => d.semana === semana);
  data.sort((a, b) => a.breakdown_pct - b.breakdown_pct); // Ascending for echarts horizontal bar
  
  if (chartOfensoresInstance && !chartOfensoresInstance.isDisposed()) {
      chartOfensoresInstance.dispose();
  }
  chartOfensoresInstance = echarts.init(ctxEl);
  
  chartOfensoresInstance.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.9)', textStyle: { color: '#f8fafc', fontFamily: 'Inter' }, borderColor: 'rgba(255,255,255,0.1)'
    },
    toolbox: {
      feature: {
        dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: '#0f172a', textareaColor: '#0f172a', textareaBorderColor: 'rgba(255,255,255,0.1)', textColor: '#e2e8f0', buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
        saveAsImage: { show: true, title: 'Salvar' }
      },
      iconStyle: { borderColor: '#94a3b8' }
    },
    dataZoom: [
      { type: 'slider', yAxisIndex: 0, show: true, right: '2%', width: 12, startValue: data.length > 15 ? data.length - 15 : 0, endValue: data.length - 1, fillerColor: 'rgba(99,102,241,0.2)', borderColor: 'none', handleSize: 0, showDetail: false },
      { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true }
    ],
    grid: { left: '3%', right: '10%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } }, axisLabel: { color: '#94a3b8', formatter: '{value}%' } },
    yAxis: { type: 'category', data: data.map(d => d.maquina), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#e2e8f0', fontWeight: '500' } },
    series: [{
      name: 'Breakdown (%)',
      type: 'bar',

      data: data.map((d, i) => {
          // data is sorted ascending, so top offenders are at the end (highest index)
          const isTop3 = i >= data.length - 3;
          return {
              value: (d.breakdown_pct * 100).toFixed(2),
              itemStyle: {
                  color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                      {offset:0, color: isTop3 ? 'rgba(244, 63, 94, 0.9)' : 'rgba(99, 102, 241, 0.9)'},
                      {offset:1, color: isTop3 ? 'rgba(244, 63, 94, 0.35)' : 'rgba(99, 102, 241, 0.35)'}
                  ]),
                  borderRadius: [0, 8, 8, 0]
              }
          };
      })
    }]
  });
}

window.addEventListener('resize', () => {
    if (chartEvolucaoInstance && !chartEvolucaoInstance.isDisposed()) {
        if (chartEvolucaoInstance.getDom().clientWidth > 0) chartEvolucaoInstance.resize();
    }
    if (chartOfensoresInstance && !chartOfensoresInstance.isDisposed()) {
        if (chartOfensoresInstance.getDom().clientWidth > 0) chartOfensoresInstance.resize();
    }
});

function renderViewLinha(linhaStr) {
  document.getElementById('lblKpiLinhaAnual').textContent = linhaStr;
  document.getElementById('lblKpiLinhaMensal').textContent = linhaStr;
  document.getElementById('lblKpiLinhaMtbf').textContent = linhaStr;
  
  const linhaData = kpiDataLinhas.find(l => l.linha === linhaStr);
  document.getElementById('valKpiLinhaAnual').textContent = linhaData ? (linhaData.anual_pct).toFixed(1) + '%' : '--';
  document.getElementById('valKpiLinhaAnual').style.color = (linhaData && linhaData.anual_pct > 10) ? '#ef4444' : '#10b981';
  document.getElementById('valKpiLinhaMensal').textContent = linhaData ? (linhaData.mensal_pct).toFixed(1) + '%' : '--';
  document.getElementById('valKpiLinhaMensal').style.color = (linhaData && linhaData.mensal_pct > 10) ? '#ef4444' : '#10b981';

  // Render MTBF
  const tbody = document.querySelector('#tableKpiMtbf tbody');
  const linhaCol = linhaStr.toLowerCase().replace(' ', '_'); // e.g. "linha_4"
  const maquinas = kpiDataMtbf.filter(m => m[linhaCol] !== null && m[linhaCol] !== undefined);
  
  if (maquinas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--text-secondary);">Sem dados de MTBF cadastrados para ${linhaStr}</td></tr>`;
  } else {
    // Group by maquina to merge mec and ele
    const map = {};
    maquinas.forEach(m => {
        if(!map[m.maquina]) map[m.maquina] = { mec: '-', ele: '-', tgt: m.target };
        if(m.tipo === 'MEC') map[m.maquina].mec = m[linhaCol];
        if(m.tipo === 'ELE') map[m.maquina].ele = m[linhaCol];
    });
    let html = '';
    for(const mq in map) {
        const d = map[mq];
        const colorMec = (d.mec !== '-' && d.mec < d.tgt) ? '#ef4444' : 'inherit';
        const colorEle = (d.ele !== '-' && d.ele < d.tgt) ? '#ef4444' : 'inherit';
        html += `<tr style="border-bottom: 1px solid var(--border);">
            <td>${mq}</td>
            <td style="color: ${colorMec}">${d.mec}</td>
            <td style="color: ${colorEle}">${d.ele}</td>
            <td>>= ${d.tgt}h</td>
        </tr>`;
    }
    tbody.innerHTML = html;
  }
}

function renderTabelaAcoes(acoes) {
  const tbody = document.querySelector('#tableKpiAcoes tbody');
  if (!tbody) return;
  if (!acoes || acoes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--text-secondary);">Nenhum plano carregado. Faça o upload da planilha.</td></tr>';
    return;
  }
  tbody.innerHTML = acoes.map(a => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 0.75rem;">${a.data_str || '-'}</td>
      <td style="padding: 0.75rem; color: var(--text-primary); font-weight: 500;">${a.projeto}</td>
      <td style="padding: 0.75rem;"><span style="display:inline-block; padding: 2px 8px; background: rgba(255,255,255,0.1); border-radius: 12px; font-size: 0.8rem;">${a.responsavel}</span></td>
      <td style="padding: 0.75rem;"><span style="display:inline-block; padding: 4px 8px; background: rgba(59, 130, 246, 0.2); color: #3b82f6; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${a.status_col || 'ABERTO'}</span></td>
    </tr>
  `).join('');
}

// --- EDICAO MANUAL ---
function abrirModalEdicao() {
  try {
    const modal = document.getElementById('modal-edit-kpi');
    if(!modal) console.error("Erro: Elemento modal-edit-kpi não encontrado!");
    modal.style.display = 'flex';
    
    const trs = document.querySelectorAll('#tableEditKpiLinhas tbody tr');
    trs.forEach(tr => {
      const ln = tr.cells[0].textContent.trim();
      const data = kpiDataLinhas.find(x => x.linha === ln);
      if(data) {
          tr.cells[1].textContent = data.anual_pct;
          tr.cells[2].textContent = data.mensal_pct;
      } else {
          tr.cells[1].textContent = '0.0';
          tr.cells[2].textContent = '0.0';
      }
    });
    
    const comp = {};
    kpiDataCompliance.forEach(c => comp[c.tipo] = c.valor_pct);
    document.getElementById('editKpiCompPM').value = comp['PM'] !== undefined ? comp['PM'] : '0';
    document.getElementById('editKpiCompLubri').value = comp['LUB'] !== undefined ? comp['LUB'] : '0';
    document.getElementById('editKpiCompPrev').value = comp['PREV'] !== undefined ? comp['PREV'] : '0';
    document.getElementById('editKpiCompEspec').value = comp['ESPEC'] !== undefined ? comp['ESPEC'] : '0';
  } catch (err) {
    alert("Erro ao abrir modal: " + err.message);
  }
}

async function salvarDadosManuais() {
  try {
      const btn = document.getElementById('btnSaveKpiManual');
      btn.textContent = 'Salvando...'; btn.disabled = true;
      
      // Salvar Linhas
      const trs = document.querySelectorAll('#tableEditKpiLinhas tbody tr');
      let records = [];
      trs.forEach(tr => {
         records.push({
             linha: tr.cells[0].textContent,
             anual_pct: parseFloat(tr.cells[1].textContent.replace(',','.')) || 0,
             mensal_pct: parseFloat(tr.cells[2].textContent.replace(',','.')) || 0
         });
      });
      await apiRequest('kpi_linhas', 'DELETE');
      for (let r of records) { try { await apiRequest('kpi_linhas', 'POST', [r]); } catch(e){} }
      
      // Salvar Compliance
      const compRecords = [
          { tipo: 'PM', valor_pct: parseFloat(document.getElementById('editKpiCompPM').value) },
          { tipo: 'LUB', valor_pct: parseFloat(document.getElementById('editKpiCompLubri').value) },
          { tipo: 'PREV', valor_pct: parseFloat(document.getElementById('editKpiCompPrev').value) },
          { tipo: 'ESPEC', valor_pct: parseFloat(document.getElementById('editKpiCompEspec').value) }
      ];
      await apiRequest('kpi_compliance', 'DELETE');
      for (let r of compRecords) { try { await apiRequest('kpi_compliance', 'POST', [r]); } catch(e){} }
      
      // Salvar Diario Mocked Reset
      kpiDataDiario = []; 
      
      await carregarEAtualizarPainel();
      document.getElementById('modal-edit-kpi').style.display = 'none';
      Swal.fire('Salvo!', 'Os dados manuais foram atualizados.', 'success');
  } catch (e) {
      console.error(e);
      Swal.fire('Erro', 'Falha ao salvar dados manuais.', 'error');
  } finally {
      const btn = document.getElementById('btnSaveKpiManual');
      btn.textContent = 'Salvar Alterações'; btn.disabled = false;
  }
}

// ==========================================
// ==========================================
// MÓDULO EVIDÊNCIAS E DIAGNÓSTICOS (ÁLBUNS E FOTOS)
// ==========================================

async function renderAlbuns(mes) {
  const grid = document.getElementById('gridAlbuns');
  const empty = document.getElementById('emptyAlbuns');
  if (!grid || !empty) return;

  grid.innerHTML = '<div style="color:var(--text-secondary); padding:2rem;">Carregando álbuns...</div>';
  empty.style.display = 'none';

  try {
    const albuns = await carregarAlbuns(mes);
    if (!albuns || albuns.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    grid.innerHTML = '';
    for (const alb of albuns) {
      const card = document.createElement('div');
      card.style.cssText = 'background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative;';
      card.onmouseover = () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 8px 12px rgba(0,0,0,0.2)'; };
      card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; };

      // Buscar evidências para mostrar quantidade e capa
      const evidencias = await carregarEvidenciasDoAlbum(alb.id);
      const qtde = evidencias.length;
      let capaHtml = '<div style="width:100%; height:180px; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--border);">📁</div>';
      
      // Criar colagem (até 4 fotos)
      if (qtde > 0) {
        const fotos = evidencias.filter(e => e.foto_url).slice(0, 4);
        if (fotos.length > 0) {
           let gridStyle = fotos.length === 1 ? '1fr' : '1fr 1fr';
           let rowsStyle = fotos.length <= 2 ? '1fr' : '1fr 1fr';
           
           let colagem = `<div style="width:100%; height:180px; display: grid; grid-template-columns: ${gridStyle}; grid-template-rows: ${rowsStyle}; gap: 2px; background: var(--border);">`;
           fotos.forEach(f => {
             colagem += `<div style="background: url('${f.foto_url}') center/cover no-repeat; width: 100%; height: 100%;"></div>`;
           });
           colagem += `</div>`;
           capaHtml = colagem;
        }
      }

      card.innerHTML = `
        ${capaHtml}
        <div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%);">
          <h4 style="margin: 0; color: var(--gold); font-size: 1.1rem; line-height: 1.3;">${alb.titulo}</h4>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-secondary); font-size: 0.85rem;">${qtde} ${qtde === 1 ? 'foto' : 'fotos'}</span>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn-editar-album btn btn-ghost" style="padding: 4px; font-size: 0.8rem; border: none; z-index: 2;" data-id="${alb.id}" title="Editar">✏️</button>
              <button class="btn-excluir-album btn btn-ghost" style="padding: 4px; font-size: 0.8rem; border: none; z-index: 2;" data-id="${alb.id}" title="Excluir">🗑️</button>
            </div>
          </div>
        </div>
      `;

      // Clicar no card abre a galeria (exceto nos botões de ação)
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        abrirGaleriaAlbum(alb);
      });

      card.querySelector('.btn-editar-album').addEventListener('click', () => abrirModalAlbum(alb, mes));
      card.querySelector('.btn-excluir-album').addEventListener('click', async () => {
        if (confirm(`Tem certeza que deseja excluir o álbum "${alb.titulo}" e todas as fotos dentro dele?`)) {
          await excluirAlbum(alb.id);
          renderAlbuns(mes);
        }
      });

      grid.appendChild(card);
    }
  } catch (error) {
    console.error('Erro ao carregar álbuns:', error);
    grid.innerHTML = '<div style="color:#ef4444; padding:2rem;">Erro ao carregar álbuns.</div>';
  }
}

function abrirGaleriaAlbum(album) {
  currentAlbumId = album.id;
  document.getElementById('kpi-view-albuns').style.display = 'none';
  document.getElementById('kpi-view-evidencias-galeria').style.display = 'flex';
  document.getElementById('lblAlbumAtualTitulo').textContent = `📂 ${album.titulo}`;
  renderEvidenciasDoAlbumRender(album.id);
}

async function renderEvidenciasDoAlbumRender(album_id) {
  const grid = document.getElementById('gridEvidencias');
  const empty = document.getElementById('emptyEvidencias');
  if (!grid || !empty) return;

  grid.innerHTML = '<div style="color:var(--text-secondary); padding:2rem;">Carregando fotos...</div>';
  empty.style.display = 'none';

  try {
    const evidencias = await carregarEvidenciasDoAlbum(album_id);
    const btnApresentacao = document.getElementById('btnApresentacao');
    
    if (!evidencias || evidencias.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      if(btnApresentacao) btnApresentacao.style.display = 'none';
      return;
    }

    if(btnApresentacao) btnApresentacao.style.display = 'flex';
    grid.innerHTML = '';
    evidencias.forEach(ev => {
      const card = document.createElement('div');
      card.style.cssText = 'background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
      
      let imgHtml = '';
      if (ev.foto_url) {
        imgHtml = `<div style="width:100%; height:200px; background: var(--bg) url('${ev.foto_url}') center/cover no-repeat; border-bottom: 1px solid var(--border);"></div>`;
      }

      card.innerHTML = `
        ${imgHtml}
        <div style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column;">
          <h4 style="margin: 0 0 0.5rem 0; color: var(--gold); font-size: 1.1rem;">${ev.titulo}</h4>
          <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; flex: 1; white-space: pre-wrap;">${ev.descricao}</p>
          <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button class="btn-editar-ev btn btn-ghost" style="padding: 4px 8px; font-size: 0.8rem; border: 1px solid var(--border);" data-id="${ev.id}">Editar</button>
            <button class="btn-excluir-ev btn btn-ghost" style="padding: 4px 8px; font-size: 0.8rem; border: 1px solid rgba(239, 68, 68, 0.5); color: #fca5a5;" data-id="${ev.id}">Excluir</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-editar-ev').addEventListener('click', () => abrirModalEvidencia(ev, album_id));
      card.querySelector('.btn-excluir-ev').addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja excluir esta foto?')) {
          await excluirEvidencia(ev.id);
          renderEvidenciasDoAlbumRender(album_id);
        }
      });

      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Erro ao carregar fotos:', error);
    grid.innerHTML = '<div style="color:#ef4444; padding:2rem;">Erro ao carregar fotos.</div>';
  }
}

// === MODAIS ===

function abrirModalAlbum(album = null, mesAtual = '') {
  const modal = document.getElementById('modal-album');
  if (!modal) return;
  document.getElementById('album_id').value = album ? album.id : '';
  document.getElementById('album_mes').value = album ? album.mes : mesAtual;
  document.getElementById('album_titulo').value = album ? album.titulo : '';
  document.getElementById('modalAlbumTitulo').textContent = album ? 'Editar Álbum' : 'Criar Álbum';
  modal.style.display = 'flex';
}

function fecharModalAlbum() {
  const modal = document.getElementById('modal-album');
  if (modal) modal.style.display = 'none';
}

async function salvarAlbumForm() {
  const btn = document.getElementById('btnSalvarAlbum');
  const txtOrig = btn.textContent;
  btn.textContent = 'Salvando...'; btn.disabled = true;
  
  try {
    const alb = {
      id: document.getElementById('album_id').value || null,
      mes: document.getElementById('album_mes').value,
      titulo: document.getElementById('album_titulo').value
    };
    if (!alb.mes || !alb.titulo) { alert('Título é obrigatório.'); return; }
    
    await salvarAlbum(alb);
    fecharModalAlbum();
    
    const currentMes = document.getElementById('selectKpiMesEvidencia').value;
    if (currentMes === alb.mes) renderAlbuns(currentMes);
    
  } catch (error) {
    console.error(error); alert('Erro ao salvar álbum.');
  } finally {
    btn.textContent = txtOrig; btn.disabled = false;
  }
}

function abrirModalEvidencia(ev = null, album_id = '') {
  const modal = document.getElementById('modal-evidencia');
  if (!modal) return;
  
  document.getElementById('evidencia_id').value = ev ? ev.id : '';
  
  // Como reaproveitamos o form antigo, vamos esconder o campo Mês que não faz mais sentido
  const mesInput = document.getElementById('evidencia_mes');
  if (mesInput && mesInput.parentElement) {
      mesInput.parentElement.style.display = 'none';
  }
  
  document.getElementById('evidencia_titulo').value = ev ? ev.titulo : '';
  document.getElementById('evidencia_descricao').value = ev ? ev.descricao : '';
  document.getElementById('evidencia_foto_url').value = ev ? (ev.foto_url || '') : '';
  
  const fileInput = document.getElementById('evidencia_foto_file');
  if (fileInput) fileInput.value = '';
  
  const preview = document.getElementById('evidencia_foto_preview');
  if (preview) {
    if (ev && ev.foto_url) {
      preview.src = ev.foto_url;
      preview.style.display = 'block';
    } else {
      preview.src = '';
      preview.style.display = 'none';
    }
  }

  // Setup file listener
  if (fileInput && !fileInput.hasAttribute('data-bound')) {
    fileInput.setAttribute('data-bound', 'true');
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        document.getElementById('evidencia_foto_url').value = evt.target.result;
        if (preview) {
          preview.src = evt.target.result;
          preview.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('modalEvidenciaTitulo').textContent = ev ? 'Editar Foto' : 'Adicionar Foto';
  modal.style.display = 'flex';
}

function fecharModalEvidencia() {
  const modal = document.getElementById('modal-evidencia');
  if (modal) modal.style.display = 'none';
}

async function salvarEvidenciaForm() {
  const btn = document.getElementById('btnSalvarEvidencia');
  const txtOrig = btn.textContent;
  btn.textContent = 'Salvando...';
  btn.disabled = true;
  
  try {
    const ev = {
      id: document.getElementById('evidencia_id').value || null,
      album_id: currentAlbumId,
      titulo: document.getElementById('evidencia_titulo').value,
      descricao: document.getElementById('evidencia_descricao').value,
      foto_url: document.getElementById('evidencia_foto_url').value
    };
    
    if (!ev.album_id || !ev.titulo) {
      alert('Título é obrigatório.');
      return;
    }
    
    await salvarEvidencia(ev);
    fecharModalEvidencia();
    
    if (currentAlbumId) renderEvidenciasDoAlbumRender(currentAlbumId);
    
  } catch (error) {
    console.error(error);
    alert('Erro ao salvar foto.');
  } finally {
    btn.textContent = txtOrig;
    btn.disabled = false;
  }
}

// === MODO APRESENTAÇÃO ===

async function abrirApresentacao(album_id) {
  if (!album_id) return;
  const evidencias = await carregarEvidenciasDoAlbum(album_id);
  // Filtra apenas as evidências que têm foto
  presentationEvidencias = evidencias.filter(e => e.foto_url);
  
  if (presentationEvidencias.length === 0) {
    alert('Este álbum não possui fotos para apresentar.');
    return;
  }
  
  currentSlideIndex = 0;
  document.getElementById('modal-apresentacao').style.display = 'flex';
  
  // Tenta entrar em modo tela cheia do navegador
  try {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    }
  } catch (e) {
    console.warn("Fullscreen API falhou", e);
  }
  
  renderSlide();
}

function fecharApresentacao() {
  document.getElementById('modal-apresentacao').style.display = 'none';
  // Sai do tela cheia se estiver
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(()=>{});
  }
}

function renderSlide() {
  if (presentationEvidencias.length === 0) return;
  
  const ev = presentationEvidencias[currentSlideIndex];
  
  const img = document.getElementById('apresentacao-imagem');
  const backdrop = document.getElementById('apresentacao-backdrop');
  
  // Efeito rápido de fade
  img.style.opacity = 0;
  if(backdrop) backdrop.style.opacity = 0;
  
  setTimeout(() => {
    img.src = ev.foto_url;
    if(backdrop) {
      backdrop.style.backgroundImage = `url('${ev.foto_url}')`;
      backdrop.style.opacity = 1;
    }
    img.style.opacity = 1;
  }, 100);
  
  document.getElementById('apresentacao-titulo').textContent = ev.titulo;
  document.getElementById('apresentacao-descricao').textContent = ev.descricao;
  document.getElementById('apresentacao-contador').textContent = `${currentSlideIndex + 1} / ${presentationEvidencias.length}`;
}

function nextSlide() {
  if (presentationEvidencias.length === 0) return;
  currentSlideIndex++;
  if (currentSlideIndex >= presentationEvidencias.length) {
    currentSlideIndex = 0; // Loop infinito
  }
  renderSlide();
}

function prevSlide() {
  if (presentationEvidencias.length === 0) return;
  currentSlideIndex--;
  if (currentSlideIndex < 0) {
    currentSlideIndex = presentationEvidencias.length - 1; // Loop invertido
  }
  renderSlide();
}

// ============================================================
// MÓDULO: CONFIABILIDADE (MTBF / MTTR / INDISPONIBILIDADE)
// ============================================================
let _confiabPeriodo = 'MES';
let _confiabLinha   = 'TODAS';
let _confiabAno     = new Date().getFullYear();
let _confiabMesSemana = 'TODOS';
let _confiabMetas   = {};

async function carregarConfiabilidade() {
  try {
    const params = new URLSearchParams({ periodo_tipo: _confiabPeriodo, ano: _confiabAno });
    if (_confiabLinha !== 'TODAS') params.append('linha', _confiabLinha);
    const resp = await fetch(`/api/kpi/confiabilidade?${params}`);
    const dados = await resp.json();

    const empty = document.getElementById('confiabEmpty');
    const cards = document.getElementById('confiabCardsArea');
    const chartsArea = document.querySelector('#kpi-view-confiabilidade > div:nth-child(3)');

    if (!dados || dados.length === 0) {
      // Proteção anti-flicker: se os gráficos já estão visíveis (importação em andamento),
      // aguarda 2s e tenta novamente antes de mostrar o estado vazio.
      // Evita que o SSE dispare durante o DELETE e esconda os dados prematuramente.
      const chartsEl = document.getElementById('chartConfiabMtbf');
      const chartsAlreadyVisible = chartsEl && chartsEl.childElementCount > 0;
      if (chartsAlreadyVisible) {
        setTimeout(() => carregarConfiabilidade(), 2000);
        return;
      }
      if (empty) empty.style.display = 'block';
      if (cards) cards.style.display = 'none';
      if (chartsArea) chartsArea.style.display = 'none';
      destroyConfiabCharts();
      return;
    }

    if (empty) empty.style.display = 'none';
    if (cards) cards.style.display = 'grid';
    if (chartsArea) chartsArea.style.display = 'grid';

    // Atualiza opções do dropdown de Período (Mês/Semana)
    const selectMesSemana = document.getElementById('selectConfiabMesSemana');
    if (selectMesSemana) {
      const mesesOrder = {
        'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
        'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12
      };
      let uniquePeriodos = [...new Set(dados.map(d => d.periodo_ref))];
      uniquePeriodos.sort((a, b) => {
        if (mesesOrder[a] && mesesOrder[b]) return mesesOrder[a] - mesesOrder[b];
        return a.localeCompare(b);
      });
      
      selectMesSemana.innerHTML = ''; // Removed 'TODOS'
      uniquePeriodos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        selectMesSemana.appendChild(opt);
      });
      
      // Tenta restaurar ou pega o último (mais recente)
      if (uniquePeriodos.includes(_confiabMesSemana)) {
        selectMesSemana.value = _confiabMesSemana;
      } else {
        const latest = uniquePeriodos.length ? uniquePeriodos[uniquePeriodos.length - 1] : '';
        selectMesSemana.value = latest;
        _confiabMesSemana = latest;
      }
    }

    // Calcula médias para os cards de resumo usando apenas os dados filtrados
    const dadosKpi = _confiabMesSemana === 'TODOS' ? dados : dados.filter(d => d.periodo_ref === _confiabMesSemana);
    
    const avg = (arr, key) => arr.length ? arr.reduce((s, d) => s + (d[key] || 0), 0) / arr.length : 0;
    const avgMtbf  = avg(dadosKpi, 'mtbf_h');
    const avgMttr  = avg(dadosKpi, 'mttr_h');
    const avgMtta = avg(dadosKpi, 'mtta_m');

    // Metas (usa a da linha selecionada ou a primeira disponível)
    const metaRef = _confiabLinha !== 'TODAS'
      ? (_confiabMetas[_confiabLinha] || Object.values(_confiabMetas)[0] || {})
      : (Object.values(_confiabMetas)[0] || {});
    const metaMtbf  = metaRef.meta_mtbf_h || 4;
    const metaMttr  = metaRef.meta_mttr_h || 0.5;
    const metaMtta = 30; // 30 minutes default meta for MTTA

    // Atualiza cards
    const setCard = (elId, val, meta, fmtFn, higherIsBetter) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = fmtFn(val);
      const varEl = document.getElementById(elId + 'Var');
      if (varEl) {
        const delta = ((val - meta) / meta * 100);
        const good  = higherIsBetter ? delta >= 0 : delta <= 0;
        varEl.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs meta`;
        varEl.style.color = good ? '#10b981' : '#ef4444';
      }
    };
    const setCardMtta = (elId, val, meta, fmtFn, higherIsBetter) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = fmtFn(val);
      const varEl = document.getElementById(elId + 'Var');
      if (varEl) {
        const delta = ((val - meta) / meta * 100);
        const good  = higherIsBetter ? delta >= 0 : delta <= 0;
        varEl.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs meta`;
        varEl.style.color = good ? '#10b981' : '#ef4444';
      }
    };

    document.getElementById('cardConfiabMtbfMeta').textContent  = `Meta: ${metaMtbf}h`;
    document.getElementById('cardConfiabMttrMeta').textContent  = `Meta: ${metaMttr}h`;
    
    let mttaMetaEl = document.getElementById('cardConfiabMttaMeta');
    if(mttaMetaEl) mttaMetaEl.textContent = `Meta: ${metaMtta}m`;

    setCard('cardConfiabMtbf',  avgMtbf,  metaMtbf,  v => v.toFixed(2) + 'h',  true);
    setCard('cardConfiabMttr',  avgMttr,  metaMttr,  v => v.toFixed(2) + 'h',  false);
    setCardMtta('cardConfiabMtta', avgMtta, metaMtta, v => v.toFixed(2) + 'm', false);

    // Garante cor dos cards conforme situação
    document.getElementById('cardConfiabMtbf').style.color  = avgMtbf  >= metaMtbf  ? '#10b981' : '#ef4444';
    document.getElementById('cardConfiabMttr').style.color  = avgMttr  <= metaMttr  ? '#10b981' : '#ef4444';
    
    let mttaCardEl = document.getElementById('cardConfiabMtta');
    if(mttaCardEl) mttaCardEl.style.color = avgMtta <= metaMtta ? '#10b981' : '#ef4444';

    // Renderiza gráficos
    renderConfiabilidadeCharts(dados, {
      meta_mtbf_h: metaMtbf,
      meta_mttr_h: metaMttr,
      meta_mtta_m: metaMtta
    }, _confiabLinha);

    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);

  } catch(e) {
    console.error('Erro ao carregar confiabilidade:', e);
  }
}

async function carregarMetasConfiabilidade() {
  try {
    const resp = await fetch('/api/kpi/metas-confiabilidade');
    const lista = await resp.json();
    _confiabMetas = {};
    for (const m of lista) _confiabMetas[m.linha] = m;
  } catch(e) { console.error('Erro ao carregar metas:', e); }
}

function abrirModalMetas() {
  const modal = document.getElementById('modalMetasConfiab');
  const form  = document.getElementById('metasConfiabForm');
  if (!modal || !form) return;

  const linhas = ['Linha 4','Linha 5','Linha 6','Linha 7','Linha 8','Linha 9'];
  form.innerHTML = linhas.map(ln => {
    const m = _confiabMetas[ln] || { meta_mtbf_h: 4, meta_mttr_h: 0.5, meta_indisponibilidade_pct: 8 };
    return `
      <div style="border:1px solid var(--border); border-radius:10px; padding:1rem; margin-bottom:0.75rem;">
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:0.75rem; font-size:0.9rem;">${ln}</div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.5rem;">
          <div>
            <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:2px;">MTBF Alvo (h)</label>
            <input type="number" step="0.1" min="0" class="meta-input" data-linha="${ln}" data-campo="meta_mtbf_h"
              value="${m.meta_mtbf_h}" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:6px 10px; font-size:0.9rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:2px;">MTTR Alvo (h)</label>
            <input type="number" step="0.01" min="0" class="meta-input" data-linha="${ln}" data-campo="meta_mttr_h"
              value="${m.meta_mttr_h}" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:6px 10px; font-size:0.9rem;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:2px;">Indisp. Alvo (%)</label>
            <input type="number" step="0.1" min="0" max="100" class="meta-input" data-linha="${ln}" data-campo="meta_indisponibilidade_pct"
              value="${m.meta_indisponibilidade_pct}" style="width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:6px 10px; font-size:0.9rem;">
          </div>
        </div>
      </div>`;
  }).join('');

  modal.style.display = 'flex';
}

async function salvarMetasConfiabilidade() {
  const inputs = document.querySelectorAll('.meta-input');
  const byLinha = {};
  inputs.forEach(inp => {
    const ln = inp.dataset.linha;
    const campo = inp.dataset.campo;
    if (!byLinha[ln]) byLinha[ln] = { linha: ln };
    byLinha[ln][campo] = parseFloat(inp.value) || 0;
  });
  const payload = Object.values(byLinha);
  try {
    const resp = await fetch('/api/kpi/metas-confiabilidade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Erro ao salvar metas');
    await carregarMetasConfiabilidade();
    document.getElementById('modalMetasConfiab').style.display = 'none';
    carregarConfiabilidade();
    if (window.Swal) Swal.fire({ icon: 'success', title: 'Metas salvas!', timer: 1500, showConfirmButton: false });
  } catch(e) {
    if (window.Swal) Swal.fire({ icon: 'error', title: 'Erro', text: e.message });
  }
}

async function importarMGPRO(file) {
  if (!file) return;
  if (!window.XLSX) { alert('Biblioteca XLSX não carregada.'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' });

      if (!raw || raw.length < 2) { alert('Arquivo vazio ou sem linhas.'); return; }

      // Detecta cabeçalho (procura linha com 'Grupos de Paradas')
      let headerRow = 0;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        if (raw[i].some(c => String(c || '').includes('Grupos'))) { headerRow = i; break; }
      }
      const headers = raw[headerRow].map(h => String(h || '').trim());

      // Detecta índices das colunas necessitárias
      const iGrupo = headers.findIndex(h => h.includes('Grupos'));
      const iLinha = headers.findIndex(h => h.toLowerCase() === 'linha');
      const iData  = headers.findIndex(h => h.toLowerCase() === 'data');
      const iDur   = headers.findIndex(h => h.toLowerCase().includes('ura'));
      const iInicio = headers.findIndex(h => h.toLowerCase() === 'início' || h.toLowerCase() === 'inicio');

      const rows = [];
      let ano = new Date().getFullYear();
      let mes_override = null;
      const match = file.name.match(/(\d{4})-(\d{2})/);
      if (match) {
        ano = parseInt(match[1]);
        mes_override = parseInt(match[2]);
      }

      for (let i = headerRow + 1; i < raw.length; i++) {
        const row = raw[i];
        const grupo = String(row[iGrupo] || '').trim();
        if (!grupo) continue;
        const dataStr = String(row[iData] || '').slice(0, 10);
        if (!match && dataStr.length >= 4) {
          const y = parseInt(dataStr.slice(0, 4));
          if (y > 2020 && y < 2100) ano = y;
        }
        rows.push({
          grupo,
          linha: String(row[iLinha] || '').trim(),
          data: dataStr,
          duracao: String(row[iDur] || '0:0:0').trim(),
          inicio: iInicio >= 0 ? String(row[iInicio] || '0:0:0').trim() : '0:0:0'
        });
      }

      if (rows.length === 0) { alert('Nenhuma linha de dados encontrada.'); return; }

      const resp = await fetch('/api/import/paradas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, ano, mes: mes_override })
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || 'Erro no servidor');

      if (window.Swal) {
        Swal.fire({
          icon: 'success',
          title: 'Importado com sucesso!',
          html: `<b>${result.importados}</b> registros de reparo processados para <b>${ano}</b>.`,
          confirmButtonText: 'Ok'
        });
      }
      // Atualiza o filtro de ano
      const selAno = document.getElementById('selectConfiabAno');
      if (selAno) {
        if (![...selAno.options].find(o => o.value == ano)) {
          selAno.insertAdjacentHTML('afterbegin', `<option value="${ano}">${ano}</option>`);
        }
        selAno.value = ano;
        _confiabAno = ano;
      }
      await carregarConfiabilidade();
    } catch(err) {
      console.error(err);
      if (window.Swal) Swal.fire({ icon: 'error', title: 'Erro na importação', text: err.message });
    }
  };
  reader.readAsArrayBuffer(file);
}

export function initConfiabilidade() {
  // Botões toggle Mensal/Semanal
  document.querySelectorAll('.btn-toggle-confiab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-toggle-confiab').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
        b.style.fontWeight = '400';
      });
      btn.style.background  = 'var(--gold)';
      btn.style.color       = '#000';
      btn.style.fontWeight  = '600';
      
      // Se mudar de Mensal para Semanal ou vice-versa, reseta o dropdown de mês/semana
      if (_confiabPeriodo !== btn.dataset.periodo) {
          _confiabPeriodo = btn.dataset.periodo;
          _confiabMesSemana = 'TODOS';
      }
      
      carregarConfiabilidade();
    });
  });

  // Filtros
  document.getElementById('selectConfiabLinha')?.addEventListener('change', e => {
    _confiabLinha = e.target.value;
    carregarConfiabilidade();
  });
  document.getElementById('selectConfiabAno')?.addEventListener('change', e => {
    _confiabAno = parseInt(e.target.value);
    _confiabMesSemana = 'TODOS'; // reset ao mudar de ano
    carregarConfiabilidade();
  });
  document.getElementById('selectConfiabMesSemana')?.addEventListener('change', e => {
    _confiabMesSemana = e.target.value;
    carregarConfiabilidade();
  });

  // Import
  document.getElementById('fileImportMGPRO')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) importarMGPRO(f);
    e.target.value = '';
  });

  // Modal de metas
  document.getElementById('btnConfiabMetas')?.addEventListener('click', abrirModalMetas);
  document.getElementById('btnFecharMetasConfiab')?.addEventListener('click', () => {
    document.getElementById('modalMetasConfiab').style.display = 'none';
  });
  document.getElementById('btnCancelarMetasConfiab')?.addEventListener('click', () => {
    document.getElementById('modalMetasConfiab').style.display = 'none';
  });
  document.getElementById('btnSalvarMetasConfiab')?.addEventListener('click', salvarMetasConfiabilidade);

  // Carrega
  carregarMetasConfiabilidade().then(() => carregarConfiabilidade());
}

window.abrirDrilldownMaquinas = async function(periodo) {
  document.getElementById('modalDrilldownSub').textContent = `Período: ${periodo}`;
  document.getElementById('modal-drilldown-maquinas').style.display = 'flex';
  
  const chartEl = document.getElementById('chartDrilldownMaquinas');
  let inst = echarts.getInstanceByDom(chartEl);
  if(!inst) inst = echarts.init(chartEl);
  
  // Force resize immediately since modal just became visible
  setTimeout(() => {
    if (inst) inst.resize();
  }, 10);
  
  inst.showLoading({ text: 'Carregando...', color: '#10b981', textColor: '#f1f5f9', maskColor: 'rgba(15, 23, 42, 0.8)' });
  
  try {
    const resp = await fetch(`/api/kpi/drilldown_maquinas?semana=${encodeURIComponent(periodo)}&linha=${encodeURIComponent(_confiabLinha)}&ano=${encodeURIComponent(_confiabAno)}`);
    const rawData = await resp.json();
    inst.hideLoading();
    
    // Formatar e ordenar
    const data = rawData.map(d => ({
      ...d,
      tempo_total_min: Math.round(d.tempo_total_min * 10) / 10
    }));
    data.sort((a,b) => a.tempo_total_min - b.tempo_total_min);

    // Cálculos de Inteligência Executiva
    const totalMinutos = data.reduce((acc, d) => acc + d.tempo_total_min, 0);
    const totalFalhas = data.reduce((acc, d) => acc + d.n_falhas, 0);
    const sortedDesc = [...data].sort((a,b) => b.tempo_total_min - a.tempo_total_min);
    
    const formatTime = (totalMin) => {
      if (!totalMin) return '0m';
      const m = Math.round(totalMin);
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      if (hours > 0) return `${hours.toLocaleString('pt-BR')}h ${mins}m`;
      return `${mins}m`;
    };

    document.getElementById('drilldownTotalMinutos').textContent = formatTime(totalMinutos);
    document.getElementById('drilldownTotalOcorrencias').textContent = totalFalhas.toLocaleString('pt-BR');

    const rankingHtml = sortedDesc.slice(0, 3).map((d, index) => {
       const percent = totalMinutos > 0 ? ((d.tempo_total_min / totalMinutos) * 100).toFixed(1) : 0;
       const colors = ['rgba(212,175,55,0.15)', 'rgba(192,192,192,0.1)', 'rgba(205,127,50,0.1)'];
       const borderColors = ['rgba(212,175,55,0.4)', 'rgba(192,192,192,0.3)', 'rgba(205,127,50,0.3)'];
       const labels = ['1º MAIOR', '2º MAIOR', '3º MAIOR'];
       return `
         <div style="background: ${colors[index] || 'rgba(15,23,42,0.5)'}; border: 1px solid ${borderColors[index] || 'rgba(255,255,255,0.05)'}; padding: 0.85rem 1.25rem; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
           <div style="display: flex; flex-direction: column; gap: 0.25rem;">
             <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px;">${labels[index]}</span>
             <strong style="color: #e2e8f0; font-size: 0.95rem; text-transform: uppercase;">${d.maquina}</strong>
           </div>
           <div style="text-align: right;">
             <div style="color: #f43f5e; font-weight: 700; font-family: monospace; font-size: 1.15rem;">${formatTime(d.tempo_total_min)}</div>
             <div style="color: #94a3b8; font-size: 0.75rem; font-weight: 500;">${percent}% do impacto • ${d.n_falhas} falhas</div>
           </div>
         </div>
       `;
    }).join('');
    
    document.getElementById('drilldownRankingMaquinas').innerHTML = rankingHtml || '<div style="color: var(--muted); font-size: 0.85rem;">Sem dados suficientes neste período.</div>';

    let insight = "Nenhum dado de parada registrado neste período.";
    if (sortedDesc.length > 0) {
      const pior = sortedDesc[0];
      const percent = totalMinutos > 0 ? ((pior.tempo_total_min / totalMinutos) * 100).toFixed(1) : 0;
      insight = `A planta fabril registrou um tempo total parado de <strong>${formatTime(totalMinutos)}</strong>.<br><br>`;
      insight += `O equipamento <strong>${pior.maquina}</strong> lidera o índice de ofensores corporativos, sendo responsável por <strong>${percent}%</strong> do "downtime" da fábrica, com ${pior.n_falhas} ocorrência(s). Direcionar esforços corretivos primários a este maquinário maximizará a disponibilidade (OEE) geral.`;
    }
    document.getElementById('drilldownInsightTexto').innerHTML = insight;
    
    inst.setOption({
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)', 
        borderColor: 'rgba(212,175,55,0.4)',
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: '#f1f5f9', fontSize: 13, fontFamily: 'Inter, sans-serif' },
        formatter: (params) => {
          let s = `<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 8px;">
                     <strong style="color: #d4af37; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">${params[0].name}</strong>
                   </div>`;
          params.forEach(p => {
            const val = p.seriesIndex === 0 ? `<strong>${formatTime(p.value)}</strong>` : `<strong>${p.value}</strong> <span style="font-size:0.85em;color:#94a3b8">ocorrências</span>`;
            s += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-top: 4px;">
                    <span>${p.marker} ${p.seriesName}</span>
                    <span style="font-family: monospace; font-size: 14px;">${val}</span>
                  </div>`;
          });
          return s;
        }
      },
      legend: { textStyle: { color: '#e2e8f0', fontWeight: '500' }, top: 5, itemGap: 20 },
      grid: { left: '2%', right: '10%', bottom: '5%', top: 60, containLabel: true },
      xAxis: [
        { 
          type: 'value', 
          name: 'Tempo Total (min)', 
          nameLocation: 'middle',
          nameGap: 30,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: '500' },
          axisLabel: { color: '#94a3b8', fontFamily: 'monospace' }, 
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)', type: 'solid' } } 
        },
        { 
          type: 'value', 
          name: 'Frequência (Falhas)', 
          position: 'top', 
          nameLocation: 'middle',
          nameGap: 25,
          nameTextStyle: { color: '#38bdf8', fontSize: 12, fontWeight: '500' },
          axisLabel: { color: '#38bdf8', fontFamily: 'monospace' }, 
          splitLine: { show: false } 
        }
      ],
      dataZoom: [
        {
          type: 'slider',
          yAxisIndex: 0,
          right: 0,
          width: 10,
          start: data.length > 15 ? Math.max(0, 100 - Math.floor((15 / data.length) * 100)) : 0,
          end: 100,
          borderColor: 'transparent',
          fillerColor: 'rgba(212,175,55,0.4)',
          backgroundColor: 'rgba(255,255,255,0.02)',
          handleSize: '100%',
          showDetail: false,
          showDataShadow: false
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: true,
          moveOnMouseMove: true
        }
      ],
      yAxis: { 
        type: 'category', 
        data: data.map(d => d.maquina), 
        axisLabel: { 
          color: '#e2e8f0', 
          fontWeight: '600', 
          fontSize: 12, 
          margin: 12,
          formatter: function (value) {
            return value.length > 35 ? value.substring(0, 35) + '...' : value;
          }
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
      },
      series: [
        {
          name: 'Tempo Parado',
          type: 'bar',
          xAxisIndex: 0,
          barMaxWidth: 24, // A bit slimmer for elegance
          data: data.map(d => d.tempo_total_min),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
              {offset:0, color: 'rgba(244, 63, 94, 0.9)'}, 
              {offset:1, color: 'rgba(244, 63, 94, 0.1)'}
            ]),
            borderRadius: [0, 8, 8, 0],
            shadowBlur: 10,
            shadowColor: 'rgba(244, 63, 94, 0.3)',
            shadowOffsetX: 2
          },
          label: { 
            show: true, 
            position: 'right', 
            color: '#f1f5f9', 
            formatter: (p) => formatTime(p.value),
            fontWeight: '600',
            fontSize: 13,
            distance: 10
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 15,
              shadowColor: 'rgba(244, 63, 94, 0.6)'
            }
          }
        },
        {
          name: 'Qtd Falhas',
          type: 'line',
          xAxisIndex: 1,
          data: data.map(d => d.n_falhas),
          itemStyle: { 
            color: '#38bdf8',
            shadowBlur: 8,
            shadowColor: 'rgba(56, 189, 248, 0.8)'
          },
          symbol: 'circle',
          symbolSize: 14,
          lineStyle: { 
            width: 3, 
            type: 'dashed',
            shadowBlur: 10,
            shadowColor: 'rgba(56, 189, 248, 0.3)',
            shadowOffsetY: 4
          },
          label: { 
            show: false, 
            position: 'top', 
            color: '#38bdf8', 
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            padding: [4, 8],
            borderRadius: 4,
            borderWidth: 1,
            borderColor: 'rgba(56, 189, 248, 0.3)',
            formatter: '{c}',
            fontWeight: 'bold',
            fontSize: 12,
            distance: 12
          }
        }
      ]
    });
    
    // Safety resize after render
    setTimeout(() => { if(inst) inst.resize(); }, 150);
    
  } catch(e) {
    inst.hideLoading();
    console.error(e);
  }
};
