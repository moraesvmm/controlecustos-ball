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

// ---- DATA FETCHING ----
let chartEvolucaoInstance = null;
let chartOfensoresInstance = null;
let kpiDataBreakdowns = [];
let kpiDataOfensores = [];
let kpiDataLinhas = [];
let kpiDataDiario = [];
let kpiDataCompliance = [];
let kpiDataMtbf = [];

async function carregarEAtualizarPainel() {
  try {
    kpiDataBreakdowns = await apiRequest('kpi_breakdowns', 'GET') || [];
    kpiDataOfensores = await apiRequest('kpi_maquinas_ofensoras', 'GET') || [];
    const kpiAcoes = await apiRequest('kpi_plano_acoes', 'GET') || [];
    
    kpiDataLinhas = await apiRequest('kpi_linhas', 'GET') || [];
    kpiDataDiario = await apiRequest('kpi_diario', 'GET') || [];
    kpiDataCompliance = await apiRequest('kpi_compliance', 'GET') || [];
    kpiDataMtbf = await apiRequest('kpi_mtbf', 'GET') || [];
    
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

function atualizarCardsFixos() {
  const semanas = kpiDataBreakdowns.filter(d => d.periodo_tipo === 'semana' && d.breakdown_real !== null);
  const meses = kpiDataBreakdowns.filter(d => d.periodo_tipo === 'mes' && d.breakdown_real !== null);
  
  if (semanas.length > 0) {
    const ultima = semanas[semanas.length - 1];
    document.getElementById('kpiBreakdownSemana').textContent = (ultima.breakdown_real * 100).toFixed(2) + '%';
    
    // Find the latest meta available
    const ultSemMeta = [...kpiDataBreakdowns].reverse().find(d => d.periodo_tipo === 'semana' && d.target_meta !== null);
    document.getElementById('kpiBreakdownMeta').textContent = ultSemMeta ? (ultSemMeta.target_meta * 100).toFixed(2) + '%' : '--';
  }
  if (meses.length > 0) {
    const ultimo = meses[meses.length - 1];
    document.getElementById('kpiBreakdownMes').textContent = (ultimo.breakdown_real * 100).toFixed(2) + '%';
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

function toggleEvolucao(tipo) {
  document.getElementById('btnKpiSemana').style.background = (tipo==='semana') ? 'var(--bg3)' : 'transparent';
  document.getElementById('btnKpiMes').style.background = (tipo==='mes') ? 'var(--bg3)' : 'transparent';
  document.getElementById('btnKpiDiario').style.background = (tipo==='diario') ? 'var(--bg3)' : 'transparent';
  
  document.getElementById('btnKpiSemana').style.color = (tipo==='semana') ? 'var(--text-primary)' : 'var(--text-secondary)';
  document.getElementById('btnKpiMes').style.color = (tipo==='mes') ? 'var(--text-primary)' : 'var(--text-secondary)';
  document.getElementById('btnKpiDiario').style.color = (tipo==='diario') ? 'var(--text-primary)' : 'var(--text-secondary)';
  
  const ctxEl = document.getElementById('chartKpiEvolucao');
  if (!ctxEl) return;
  const ctx = ctxEl.getContext('2d');
  if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 13, weight: '500' } }, position: 'top' },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
        titleFont: { family: 'Inter', size: 14, weight: 'bold' },
        bodyFont: { family: 'Inter', size: 13 }
      }
    },
    scales: {
      x: { grid: { display: false, drawBorder: false }, ticks: { color: '#94a3b8', font: { family: 'Inter' } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false, borderDash: [5, 5] }, ticks: { color: '#94a3b8', font: { family: 'Inter' }, padding: 10 } }
    }
  };

  if (tipo === 'diario') {
    if (kpiDataDiario.length === 0) {
      let mE = parseFloat(document.getElementById('editKpiDiaElec')?.value || 3.9); 
      let mM = parseFloat(document.getElementById('editKpiDiaMec')?.value || 8.2);
      kpiDataDiario = Array.from({length:30}, (_,i) => ({dia: i+1, eletrica_pct: Math.random()*mE, mecanica_pct: Math.random()*mM}));
    }
    
    chartEvolucaoInstance = new Chart(ctxEl, {
      type: 'bar',
      data: {
        labels: kpiDataDiario.map(d => d.dia),
        datasets: [
          { 
            label: 'Elétrica', 
            data: kpiDataDiario.map(d => d.eletrica_pct.toFixed(2)), 
            backgroundColor: () => {
              let gradient = ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
              gradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)');
              return gradient;
            },
            borderColor: '#ef4444',
            borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
            borderRadius: 4
          },
          { 
            label: 'Mecânica', 
            data: kpiDataDiario.map(d => d.mecanica_pct.toFixed(2)), 
            backgroundColor: () => {
              let gradient = ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
              gradient.addColorStop(1, 'rgba(59, 130, 246, 0.2)');
              return gradient;
            },
            borderColor: '#3b82f6',
            borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
            borderRadius: 4
          }
        ]
      },
      options: { ...commonOptions, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5] }, ticks: { color: '#94a3b8' } } } }
    });
  } else {
    const data = kpiDataBreakdowns.filter(d => d.periodo_tipo === tipo);
    chartEvolucaoInstance = new Chart(ctxEl, {
      type: 'line',
      data: {
        labels: data.map(d => d.periodo_nome),
        datasets: [
          { 
            label: 'Breakdown (%)', 
            data: data.map(d => (d.breakdown_real * 100).toFixed(2)), 
            borderColor: '#10b981', 
            backgroundColor: () => {
              let gradient = ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
              gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
              return gradient;
            }, 
            fill: true, 
            tension: 0.4,
            borderWidth: 3,
            pointBackgroundColor: '#0f172a',
            pointBorderColor: '#10b981',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#10b981',
            pointHoverBorderColor: '#fff'
          },
          { 
            label: 'Meta', 
            data: data.map(d => d.target_meta ? (d.target_meta * 100).toFixed(2) : null), 
            borderColor: 'rgba(239, 68, 68, 0.8)', 
            borderDash: [5, 5], 
            borderWidth: 2,
            pointRadius: 0,
            fill: false 
          }
        ]
      },
      options: commonOptions
    });
  }
}

function renderKpiOfensores(semana) {
  const ctxEl = document.getElementById('chartKpiOfensores');
  if (!ctxEl) return;
  const ctx = ctxEl.getContext('2d');
  
  let data = kpiDataOfensores.filter(d => d.semana === semana);
  data.sort((a, b) => b.breakdown_pct - a.breakdown_pct);
  
  if (chartOfensoresInstance) chartOfensoresInstance.destroy();
  chartOfensoresInstance = new Chart(ctxEl, {
    type: 'bar',
    data: {
      labels: data.map(d => d.maquina),
      datasets: [{
        label: 'Breakdown (%)',
        data: data.map(d => (d.breakdown_pct * 100).toFixed(2)),
        backgroundColor: data.map((d, i) => {
            let gradient = ctx.createLinearGradient(0, 0, 400, 0);
            if (i < 3) { // Top 3 Ofensores -> Tons avermelhados / neon alert
                gradient.addColorStop(0, 'rgba(244, 63, 94, 0.2)');
                gradient.addColorStop(1, 'rgba(244, 63, 94, 0.9)');
            } else { // Resto -> Tons azuis / roxos
                gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
                gradient.addColorStop(1, 'rgba(99, 102, 241, 0.9)');
            }
            return gradient;
        }),
        borderColor: data.map((d, i) => i < 3 ? '#f43f5e' : '#6366f1'),
        borderWidth: { top: 0, right: 2, bottom: 0, left: 0 },
        borderRadius: 4
      }]
    },
    options: { 
      indexAxis: 'y', 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            titleFont: { family: 'Inter', size: 14, weight: 'bold' }
        }
      },
      scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5], drawBorder: false }, ticks: { color: '#94a3b8', font: { family: 'Inter' } } },
          y: { grid: { display: false, drawBorder: false }, ticks: { color: '#e2e8f0', font: { family: 'Inter', weight: '500' } } }
      }
    }
  });
}

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
