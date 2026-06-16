import { fmtMoeda } from './ui.js';
import { agregarFornecedores } from './logic.js';

// Estilos injetados para o PDF corporativo
const getPDFStyles = () => `
  <style>
    .pdf-report-container {
      font-family: 'Inter', 'Segoe UI', sans-serif;
      background: white;
      color: #0f172a;
      width: 710px;
      padding: 40px;
      box-sizing: border-box;
      margin: 0;
      text-align: left;
    }
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .pdf-header img {
      max-height: 45px;
    }
    .pdf-title-container {
      text-align: right;
    }
    .pdf-title {
      font-size: 22px;
      font-weight: 800;
      margin: 0;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      font-weight: 500;
    }
    .pdf-kpi-row {
      display: flex;
      gap: 15px;
      margin-bottom: 35px;
    }
    .pdf-kpi-card {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px 20px;
    }
    .pdf-kpi-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #475569;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .pdf-kpi-value {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .pdf-kpi-sub {
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
    }
    .pdf-section-title {
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-flex-row {
      display: flex;
      gap: 30px;
      margin-bottom: 20px;
    }
    .pdf-flex-col {
      display: flex;
      flex-direction: column;
    }
    .pdf-pipeline-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pdf-pipeline-row {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }
    .pdf-pipeline-label {
      width: 140px;
      font-weight: 600;
      color: #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
    .pdf-pipeline-bar-bg {
      flex: 1;
      background: #f1f5f9;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    .pdf-pipeline-bar-fill {
      height: 100%;
      border-radius: 4px;
    }
    .pdf-pipeline-value {
      width: 30px;
      text-align: right;
      font-weight: 700;
      color: #0f172a;
    }
    .pdf-natureza-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pdf-nat-item {
      display: flex;
      align-items: center;
      font-size: 12px;
      color: #334155;
    }
    .pdf-nat-color {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      margin-right: 10px;
    }
    table.pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 10px;
    }
    table.pdf-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      text-align: left;
      padding: 12px 10px;
      border-bottom: 2px solid #cbd5e1;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
    }
    table.pdf-table td {
      padding: 10px 10px;
      border-bottom: 1px solid #f1f5f9;
    }
    table.pdf-table-alt th {
      background: #fff;
      border-top: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
  </style>
`;

function buildHeader(title) {
  const dataHora = new Date().toLocaleString('pt-BR');
  return `
    <div class="pdf-header">
      <img src="img/BALL.png" alt="Ball Corporation" />
      <div class="pdf-title-container">
        <h1 class="pdf-title">ManutenÃ§Ã£o</h1>
        <div class="pdf-subtitle">${title} &bull; Gerado em: ${dataHora}</div>
      </div>
    </div>
  `;
}

function cloneChartAsImage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return '';
  // Convert chart to image data URL so it renders perfectly in PDF without JS issues
  return `<img src="${canvas.toDataURL('image/png', 1.0)}" />`;
}

export async function gerarRelatorioExecutivoPDF(registros) {
  if (typeof html2pdf === 'undefined') {
    alert('A biblioteca PDF nÃ£o foi carregada.');
    return;
  }

  // 1. CÃ¡lculos de KPIs Executivos
  const totalRegistros = registros.length;
  let atrasadosCount = 0;
  let valorAtrasado = 0;
  let valorTotal = 0;

  let naturezas = { conserto: 0, compra: 0, servico: 0 };
  let statusCounts = {
    'ENTREGUE': 0,
    'PENDENTE DE ENTREGA': 0,
    'PENDENTE DE PEDIDO': 0,
    'PENDENTE DE RC': 0,
    'PENDENTE DE ORCAMENTO': 0,
    'PENDENTE DE ENVIO': 0,
    'PENDENTE': 0
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const topGargalos = [];
  const fornecedoresAtrasoMap = {};

  registros.forEach(r => {
    const val = Number(r.valor_previsto || r.valor || 0);
    valorTotal += val;

    const nat = (r.natureza || '').toUpperCase();
    if (nat.includes('CONSERTO')) naturezas.conserto++;
    else if (nat.includes('COMPRA')) naturezas.compra++;
    else if (nat.includes('SERV')) naturezas.servico++;

    const st = r.status || 'PENDENTE';
    if (statusCounts[st] !== undefined) statusCounts[st]++;

    if (st !== 'ENTREGUE' && r.previsao_entrega) {
      const parts = r.previsao_entrega.split('-');
      if (parts.length === 3) {
        const prev = new Date(parts[0], parts[1] - 1, parts[2]);
        if (prev < hoje) {
          atrasadosCount++;
          valorAtrasado += val;
          
          const msDiff = hoje.getTime() - prev.getTime();
          const dias = Math.floor(msDiff / (1000 * 3600 * 24));
          
          topGargalos.push({
            rc: r.rc || r.id,
            fornecedor: r.fornecedor || 'N/A',
            previsao: `${parts[2]}/${parts[1]}/${parts[0]}`,
            dias: dias,
            valor: val,
            maquina: r.maquina || 'Geral'
          });

          const f = r.fornecedor || 'NÃƒO INFORMADO';
          if (!fornecedoresAtrasoMap[f]) fornecedoresAtrasoMap[f] = { count: 0, valor: 0 };
          fornecedoresAtrasoMap[f].count++;
          fornecedoresAtrasoMap[f].valor += val;
        }
      }
    }
  });

  // Ordena pelos maiores valores retidos
  topGargalos.sort((a, b) => b.valor - a.valor);
  const top10 = topGargalos.slice(0, 10);

  // Top Fornecedores Impactantes
  const topFornecedores = Object.entries(fornecedoresAtrasoMap)
    .map(([nome, data]) => ({ nome, ...data }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  // Status HTML Pipeline
  const statusColors = {
    'PENDENTE DE ENTREGA': '#eab308',
    'ENTREGUE': '#22c55e',
    'PENDENTE DE PEDIDO': '#3b82f6',
    'PENDENTE DE ORCAMENTO': '#f97316',
    'PENDENTE DE RC': '#8b5cf6',
    'PENDENTE DE ENVIO': '#64748b'
  };

  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);
  const pipelineRows = Object.entries(statusCounts)
    .filter(([st, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([st, count]) => {
      const pct = (count / maxStatusCount) * 100;
      const color = statusColors[st] || '#94a3b8';
      return `
        <div class="pdf-pipeline-row">
          <div class="pdf-pipeline-label">${st}</div>
          <div class="pdf-pipeline-bar-bg">
            <div class="pdf-pipeline-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
          </div>
          <div class="pdf-pipeline-value">${count}</div>
        </div>
      `;
    }).join('');

  // 2. Montar o DOM do RelatÃ³rio
  const container = document.createElement('div');
  container.className = 'pdf-report-container';
  
  let tableRows = top10.map(g => `
    <tr>
      <td style="font-weight:600; color: #1e293b;">${g.rc}</td>
      <td style="color: #475569;">${g.maquina}</td>
      <td style="color: #475569;">${g.fornecedor}</td>
      <td style="color: #475569;">${g.previsao}</td>
      <td><span class="badge badge-danger">${g.dias} dias</span></td>
      <td style="font-weight:700; text-align:right; color: #b91c1c;">${fmtMoeda(g.valor)}</td>
    </tr>
  `).join('');

  if (top10.length === 0) {
    tableRows = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #64748b;">Nenhum item em atraso. Excelente!</td></tr>';
  }

  let fornRows = topFornecedores.map(f => `
    <tr>
      <td style="font-weight:600; color: #1e293b;">${f.nome}</td>
      <td style="text-align:center;">${f.count}</td>
      <td style="font-weight:700; text-align:right; color: #b91c1c;">${fmtMoeda(f.valor)}</td>
    </tr>
  `).join('');

  if (topFornecedores.length === 0) {
    fornRows = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #64748b;">Sem atrasos registrados.</td></tr>';
  }

  container.innerHTML = `
    ${getPDFStyles()}
    ${buildHeader('RelatÃ³rio Executivo AnalÃ­tico')}
    
    <div class="pdf-kpi-row">
      <div class="pdf-kpi-card" style="border-top: 4px solid #3b82f6;">
        <div class="pdf-kpi-label">Volume Financeiro Total</div>
        <div class="pdf-kpi-value">${fmtMoeda(valorTotal)}</div>
        <div class="pdf-kpi-sub">${totalRegistros} itens rastreados</div>
      </div>
      <div class="pdf-kpi-card" style="border-top: 4px solid #f59e0b;">
        <div class="pdf-kpi-label">Itens Atrasados (Gargalos)</div>
        <div class="pdf-kpi-value">${atrasadosCount} itens</div>
        <div class="pdf-kpi-sub">${((atrasadosCount/Math.max(totalRegistros,1))*100).toFixed(1)}% do volume total</div>
      </div>
      <div class="pdf-kpi-card" style="border-top: 4px solid #ef4444; background: #fff1f2;">
        <div class="pdf-kpi-label" style="color: #be123c;">Capital Retido em Atrasos</div>
        <div class="pdf-kpi-value" style="color: #e11d48;">${fmtMoeda(valorAtrasado)}</div>
        <div class="pdf-kpi-sub" style="color: #be123c;">AÃ§Ã£o corretiva sugerida</div>
      </div>
    </div>

    <div class="pdf-flex-row" style="page-break-inside: avoid;">
      <div class="pdf-flex-col" style="flex: 1.5;">
        <div class="pdf-section-title">AnÃ¡lise de Status (Pipeline)</div>
        <div class="pdf-pipeline-container">
          ${pipelineRows}
        </div>
      </div>
      <div class="pdf-flex-col" style="flex: 1;">
        <div class="pdf-section-title">Por Natureza</div>
        <div class="pdf-natureza-box">
          <div class="pdf-nat-item"><span class="pdf-nat-color" style="background:#3b82f6;"></span> Consertos: <strong>${naturezas.conserto}</strong></div>
          <div class="pdf-nat-item"><span class="pdf-nat-color" style="background:#10b981;"></span> Compras: <strong>${naturezas.compra}</strong></div>
          <div class="pdf-nat-item"><span class="pdf-nat-color" style="background:#8b5cf6;"></span> ServiÃ§os: <strong>${naturezas.servico}</strong></div>
        </div>
      </div>
    </div>

    <div style="page-break-inside: avoid;">
      <div class="pdf-section-title" style="margin-top: 40px;">Top 5 Fornecedores (ConcentraÃ§Ã£o de Atraso)</div>
      <table class="pdf-table pdf-table-alt">
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th style="text-align:center;">Qtd. Itens</th>
            <th style="text-align:right;">Capital Retido (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${fornRows}
        </tbody>
      </table>
    </div>

    <div style="page-break-inside: avoid;">
      <div class="pdf-section-title" style="margin-top: 40px;">Detalhamento dos 10 Maiores Gargalos Financeiros</div>
      <table class="pdf-table">
        <thead>
          <tr>
            <th>IdentificaÃ§Ã£o (RC/Item)</th>
            <th>MÃ¡quina</th>
            <th>Fornecedor</th>
            <th>PrevisÃ£o Original</th>
            <th>Tempo Vencido</th>
            <th style="text-align:right;">Valor Retido (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;

  // 3. Gerar PDF a partir de String HTML Pura (evita bugs de DOM/renderizaÃ§Ã£o em branco)
  const htmlString = container.outerHTML;

  const opt = {
    margin:       0.4,
    filename:     `Relatorio_Executivo_${new Date().toISOString().slice(0,10)}.pdf`,
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 800 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(htmlString).save();
  } catch (err) {
    console.error('Erro na exportacao:', err);
  }
}

export async function gerarRelatorioSLAPDF(registros) {
  if (typeof html2pdf === 'undefined') {
    alert('A biblioteca PDF nÃ£o foi carregada.');
    return;
  }

  // 1. CÃ¡lculos de SLA
  let dados = agregarFornecedores(registros);
  
  dados.sort((a, b) => {
    if (b.pontualidade !== a.pontualidade) return b.pontualidade - a.pontualidade;
    return a.mediaAtraso - b.mediaAtraso;
  });

  const totalAtivos = dados.length;
  const somaPontualidade = dados.reduce((acc, d) => acc + d.pontualidade, 0);
  const pontMedia = totalAtivos > 0 ? (somaPontualidade / totalAtivos) : 0;
  
  const somaAtraso = dados.reduce((acc, d) => acc + d.mediaAtraso, 0);
  const atrasoMedia = totalAtivos > 0 ? (somaAtraso / totalAtivos) : 0;

  // Ofensores (os 3 piores)
  const ofensores = [...dados].sort((a, b) => a.pontualidade - b.pontualidade).slice(0, 3);

  // 2. Montar o DOM
  const container = document.createElement('div');
  container.className = 'pdf-report-container';

  let ofensoresRows = ofensores.map(o => `
    <tr>
      <td style="font-weight:600;">${o.fornecedor}</td>
      <td>${o.entregues} itens</td>
      <td><span class="badge badge-danger" style="font-size: 12px;">${o.pontualidade.toFixed(1)}%</span></td>
      <td>${o.mediaAtraso > 0 ? o.mediaAtraso.toFixed(1) + ' dias' : '-'}</td>
    </tr>
  `).join('');

  if (ofensores.length === 0) {
    ofensoresRows = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum dado de ofensor.</td></tr>';
  }

  let tableRows = dados.map(d => {
    let ptClass = 'badge-success';
    if (d.pontualidade < 85) ptClass = 'badge-warning';
    if (d.pontualidade < 70) ptClass = 'badge-danger';
    
    return `
    <tr>
      <td style="font-weight:600;">${d.fornecedor}</td>
      <td>${d.entregues} itens</td>
      <td><span class="badge ${ptClass}">${d.pontualidade.toFixed(1)}%</span></td>
      <td>${d.mediaAtraso > 0 ? d.mediaAtraso.toFixed(1) + ' dias' : 'No prazo'}</td>
    </tr>
  `}).join('');

  if (dados.length === 0) {
    tableRows = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum dado de fornecedor.</td></tr>';
  }

  container.innerHTML = `
    ${getPDFStyles()}
    ${buildHeader('RelatÃ³rio SLA de Fornecedores')}
    
    <div class="pdf-kpi-row">
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Fornecedores Ativos</div>
        <div class="pdf-kpi-value">${totalAtivos}</div>
      </div>
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Pontualidade Global</div>
        <div class="pdf-kpi-value" style="color: ${pontMedia < 80 ? '#ef4444' : '#10b981'};">${pontMedia.toFixed(1)}%</div>
      </div>
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Atraso MÃ©dio Global</div>
        <div class="pdf-kpi-value">${atrasoMedia.toFixed(1)} dias</div>
      </div>
    </div>

    <div class="pdf-section-title" style="color: #ef4444; border-bottom-color: #ef4444;">Top Ofensores (Piores Pontualidades)</div>
    <table class="pdf-table" style="border: 1px solid #fee2e2;">
      <thead style="background: #fef2f2;">
        <tr>
          <th>Fornecedor Ofensor</th>
          <th>Total Entregue</th>
          <th>Pontualidade</th>
          <th>Atraso MÃ©dio</th>
        </tr>
      </thead>
      <tbody>
        ${ofensoresRows}
      </tbody>
    </table>

    <div class="pdf-section-title">Ranking Completo de Fornecedores</div>
    <table class="pdf-table">
      <thead>
        <tr>
          <th>Fornecedor</th>
          <th>Total Entregue</th>
          <th>Pontualidade</th>
          <th>Atraso MÃ©dio</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;

  // 3. Gerar PDF a partir de String HTML Pura
  const htmlString = container.outerHTML;

  const opt = {
    margin:       0.4,
    filename:     `Relatorio_SLA_${new Date().toISOString().slice(0,10)}.pdf`,
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 800 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(htmlString).save();
  } catch (err) {
    console.error('Erro na exportacao:', err);
  }
}

export async function gerarChecklistLinhaPDF(linha, mes, atividades) {
  if (typeof html2pdf === 'undefined') {
    alert('A biblioteca PDF nÃ£o foi carregada.');
    return;
  }

  // DEBUG: Log all field names and material values to console
  console.log('[PDF DEBUG] Total atividades:', atividades.length);
  if (atividades.length > 0) {
    console.log('[PDF DEBUG] Campos do primeiro registro:', Object.keys(atividades[0]));
    atividades.slice(0, 5).forEach((a, i) => {
      console.log(`[PDF DEBUG] Atividade ${i} (${a.identificador}):`, {
        material: a.material,
        material_type: typeof a.material,
        material_isArray: Array.isArray(a.material),
        allKeys: Object.keys(a).filter(k => k.toLowerCase().includes('mat'))
      });
    });
  }

  const porMaquina = {};
  atividades.forEach(a => {
    const maq = a.maquina || 'Geral';
    if (!porMaquina[maq]) porMaquina[maq] = [];
    porMaquina[maq].push(a);
  });

  const maquinas = Object.keys(porMaquina).sort();
  const container = document.createElement('div');
  container.className = 'pdf-report-container';

  // Helper to safely extract materials from various formats
  function parseMaterial(mat) {
    if (!mat) return [];
    if (Array.isArray(mat)) return mat.filter(Boolean);
    if (typeof mat === 'string') {
      // Try JSON parse first (e.g. '["item1","item2"]')
      try {
        const parsed = JSON.parse(mat);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch(e) { /* not JSON */ }
      // Split by newlines or semicolons
      const items = mat.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
      if (items.length > 0 && items[0] !== 'undefined') return items;
    }
    return [];
  }

  let htmlContent = `
    ${getPDFStyles()}
    <style>
      .pdf-report-container {
        width: 710px !important;
      }
      .machine-section {
        margin-bottom: 30px;
        page-break-inside: auto;
      }
      .machine-header {
        page-break-after: avoid;
        break-after: avoid;
      }
      .chk-table {
        margin-bottom: 20px;
        width: 100%;
        border-collapse: collapse;
      }
      .chk-table th, .chk-table td {
        border: 1px solid #e2e8f0;
        padding: 8px 10px;
        font-size: 11px;
      }
      .chk-table th {
        background: #f8fafc;
        color: #334155;
        font-weight: 600;
        text-transform: uppercase;
      }
      .chk-table tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .chk-box {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid #64748b;
        border-radius: 3px;
        vertical-align: middle;
      }
      .signature-block {
        display: flex;
        justify-content: space-between;
        margin-top: 50px;
        page-break-inside: avoid;
      }
      .signature-line {
        width: 30%;
        border-top: 1px solid #cbd5e1;
        text-align: center;
        padding-top: 5px;
        font-size: 11px;
        color: #475569;
      }
    </style>
    ${buildHeader(`Checklist de Preventiva: Linha ${linha} - ${mes}`)}
  `;

  if (maquinas.length === 0) {
    htmlContent += `<p style="text-align:center; padding: 20px;">Nenhuma atividade programada.</p>`;
  }

  maquinas.forEach(maq => {
    let totalHhMec = 0;
    let totalHhElet = 0;
    let totalDuracao = 0;
    
    porMaquina[maq].forEach(a => {
      totalHhMec += parseFloat(a.hh_mec) || 0;
      totalHhElet += parseFloat(a.hh_eletrico) || 0;
      totalDuracao += parseFloat(a.duracao_horas) || 0;
    });

    htmlContent += `
      <div class="machine-section">
      <div class="machine-header pdf-section-title" style="margin-top: 25px; margin-bottom: 5px; color: #1e293b; border-bottom: 2px solid #3b82f6; display: flex; justify-content: space-between; align-items: baseline;">
        <span>MÃQUINA: ${maq}</span>
        <span style="font-size: 11px; font-weight: normal; color: #64748b;">
          Total HH Mec: ${totalHhMec.toFixed(1)}h | Total HH ElÃ©t: ${totalHhElet.toFixed(1)}h | DuraÃ§Ã£o Est.: ${totalDuracao.toFixed(1)}h
        </span>
      </div>
      <table class="chk-table" style="margin-bottom: 5px;">
        <thead>
          <tr>
            <th style="width: 30px;">[ ]</th>
            <th style="width: 120px;">ID DA ATIVIDADE</th>
            <th>DESCRIÃ‡ÃƒO DA ATIVIDADE</th>
            <th style="width: 20%;">MATERIAIS NECESSÃRIOS</th>
            <th style="width: 25%;">OBSERVAÃ‡Ã•ES DO TÃ‰CNICO</th>
          </tr>
        </thead>
        <tbody>
    `;

    porMaquina[maq].forEach(a => {
      let descricoes = [];
      if (Array.isArray(a.atividades_descricoes) && a.atividades_descricoes.length > 0) {
        descricoes = a.atividades_descricoes;
      } else if (a.descricao) {
        descricoes = [a.descricao];
      } else {
        descricoes = ['(Sem descriÃ§Ã£o detalhada)'];
      }

      const idText = a.identificador || 'S/ ID';

      // Parse materials robustly
      const matList = parseMaterial(a.material);
      let printMat = '';
      if (matList.length > 0) {
        printMat = matList.map(m => `<div style="margin-bottom: 4px; display:flex; align-items:flex-start; gap:4px;"><span style="font-size: 9px; white-space: pre-wrap;">â€¢ ${m}</span></div>`).join('');
      }

      // Also try to get materials from atividades_materiais if it exists
      if (!printMat && a.atividades_materiais) {
        const matFromAtiv = parseMaterial(a.atividades_materiais);
        if (matFromAtiv.length > 0) {
          printMat = matFromAtiv.map(m => `<div style="margin-bottom: 4px; display:flex; align-items:flex-start; gap:4px;"><span style="font-size: 9px; white-space: pre-wrap;">â€¢ ${m}</span></div>`).join('');
        }
      }

      descricoes.forEach((d, idx) => {
        const borderStyle = idx === 0 ? 'border-top: 2px solid #cbd5e1;' : 'border-top: 1px solid #e2e8f0;';
        const printId = idx === 0 ? `<div style="font-weight:700; color:#0f172a;">${idText}</div><div style="font-size:9px; color:#64748b; margin-top:2px;">HH M:${a.hh_mec||0} | E:${a.hh_eletrico||0}</div>` : '';
        const matColumn = idx === 0 ? printMat : '';
        
        htmlContent += `
          <tr style="${borderStyle}">
            <td style="text-align: center;"><div class="chk-box"></div></td>
            <td style="vertical-align: top; background: #f8fafc;">${printId}</td>
            <td style="vertical-align: top;">${d}</td>
            <td style="vertical-align: top; background: #f8fafc;">${matColumn}</td>
            <td></td>
          </tr>
        `;
      });
    });

    htmlContent += `
        </tbody>
      </table>
      </div>
    `;
  });

  htmlContent += `
    <div class="signature-block">
      <div class="signature-line">Assinatura do TÃ©cnico / Executante</div>
      <div class="signature-line">Assinatura do Supervisor</div>
      <div class="signature-line">Data de ExecuÃ§Ã£o</div>
    </div>
  `;

  container.innerHTML = htmlContent;

  const opt = {
    margin:       0.4,
    filename:     `Checklist_Preventiva_${linha}_${mes}.pdf`,
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 800 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };

  try {
    await html2pdf().set(opt).from(container.outerHTML).save();
  } catch (err) {
    console.error('Erro na exportacao PDF:', err);
  }
}
