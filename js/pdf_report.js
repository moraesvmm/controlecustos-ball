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
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .pdf-header img {
      max-height: 50px;
    }
    .pdf-title-container {
      text-align: right;
    }
    .pdf-title {
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .pdf-subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 5px;
    }
    .pdf-kpi-row {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
    }
    .pdf-kpi-card {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px 20px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .pdf-kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .pdf-kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    .pdf-section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
      margin-top: 30px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-charts-row {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .pdf-chart-container {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      background: #fff;
    }
    .pdf-chart-container img {
      width: 100%;
      height: auto;
    }
    table.pdf-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      font-size: 12px;
      page-break-inside: avoid;
    }
    table.pdf-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid #cbd5e1;
      text-transform: uppercase;
      font-size: 10px;
    }
    table.pdf-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #0f172a;
    }
    table.pdf-table tr:last-child td {
      border-bottom: none;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-success { background: #dcfce3; color: #166534; }
  </style>
`;

function buildHeader(title) {
  const dataHora = new Date().toLocaleString('pt-BR');
  return `
    <div class="pdf-header">
      <img src="img/BALL.png" alt="Ball Corporation" />
      <div class="pdf-title-container">
        <h1 class="pdf-title">Controle de Custos</h1>
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
    alert('A biblioteca PDF não foi carregada.');
    return;
  }

  // 1. Cálculos de KPIs Executivos
  const totalRegistros = registros.length;
  let atrasadosCount = 0;
  let valorAtrasado = 0;
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const topGargalos = [];

  registros.forEach(r => {
    if (r.status !== 'ENTREGUE' && r.previsao_entrega) {
      const parts = r.previsao_entrega.split('-');
      if (parts.length === 3) {
        const prev = new Date(parts[0], parts[1] - 1, parts[2]);
        if (prev < hoje) {
          atrasadosCount++;
          const val = r.valor_previsto || r.valor || 0;
          valorAtrasado += val;
          
          const msDiff = hoje.getTime() - prev.getTime();
          const dias = Math.floor(msDiff / (1000 * 3600 * 24));
          
          topGargalos.push({
            rc: r.rc || r.id,
            fornecedor: r.fornecedor || 'N/A',
            previsao: `${parts[2]}/${parts[1]}/${parts[0]}`,
            dias: dias,
            valor: val
          });
        }
      }
    }
  });

  // Ordena pelos maiores valores retidos
  topGargalos.sort((a, b) => b.valor - a.valor);
  const top10 = topGargalos.slice(0, 10);

  // 2. Montar o DOM do Relatório
  const container = document.createElement('div');
  container.className = 'pdf-report-container';
  
  let tableRows = top10.map(g => `
    <tr>
      <td style="font-weight:600;">${g.rc}</td>
      <td>${g.fornecedor}</td>
      <td>${g.previsao}</td>
      <td><span class="badge badge-danger">${g.dias} dias</span></td>
      <td style="font-weight:600; text-align:right;">${fmtMoeda(g.valor)}</td>
    </tr>
  `).join('');

  if (top10.length === 0) {
    tableRows = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum item em atraso.</td></tr>';
  }

  container.innerHTML = `
    ${getPDFStyles()}
    ${buildHeader('Relatório Executivo de RC')}
    
    <div class="pdf-kpi-row">
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Volume de Solicitações</div>
        <div class="pdf-kpi-value">${totalRegistros} itens</div>
      </div>
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Itens Atrasados (Gargalos)</div>
        <div class="pdf-kpi-value" style="color: #ef4444;">${atrasadosCount} itens</div>
      </div>
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-label">Capital Retido em Atrasos</div>
        <div class="pdf-kpi-value" style="color: #ef4444;">${fmtMoeda(valorAtrasado)}</div>
      </div>
    </div>

    <div class="pdf-section-title">Análise Macro do Pipeline</div>
    <div class="pdf-charts-row">
      <div class="pdf-chart-container" style="flex: 1.5;">
        ${cloneChartAsImage('chartStatus')}
      </div>
      <div class="pdf-chart-container" style="flex: 1;">
        ${cloneChartAsImage('chartMaquina')}
      </div>
    </div>

    <div class="pdf-section-title">Top 10 Gargalos (Maiores Valores Retidos)</div>
    <table class="pdf-table">
      <thead>
        <tr>
          <th>RC / Identificação</th>
          <th>Fornecedor</th>
          <th>Previsão Original</th>
          <th>Dias em Atraso</th>
          <th style="text-align:right;">Valor (R$)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;

  // 3. Gerar PDF a partir de String HTML Pura (evita bugs de DOM/renderização em branco)
  const htmlString = container.outerHTML;

  const opt = {
    margin:       0.4,
    filename:     `Relatorio_Executivo_${new Date().toISOString().slice(0,10)}.pdf`,
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
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
    alert('A biblioteca PDF não foi carregada.');
    return;
  }

  // 1. Cálculos de SLA
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
    ${buildHeader('Relatório SLA de Fornecedores')}
    
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
        <div class="pdf-kpi-label">Atraso Médio Global</div>
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
          <th>Atraso Médio</th>
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
          <th>Atraso Médio</th>
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
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
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
    alert('A biblioteca PDF não foi carregada.');
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
        <span>MÁQUINA: ${maq}</span>
        <span style="font-size: 11px; font-weight: normal; color: #64748b;">
          Total HH Mec: ${totalHhMec.toFixed(1)}h | Total HH Elét: ${totalHhElet.toFixed(1)}h | Duração Est.: ${totalDuracao.toFixed(1)}h
        </span>
      </div>
      <table class="chk-table" style="margin-bottom: 5px;">
        <thead>
          <tr>
            <th style="width: 30px;">[ ]</th>
            <th style="width: 120px;">ID DA ATIVIDADE</th>
            <th>DESCRIÇÃO DA ATIVIDADE</th>
            <th style="width: 20%;">MATERIAIS NECESSÁRIOS</th>
            <th style="width: 25%;">OBSERVAÇÕES DO TÉCNICO</th>
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
        descricoes = ['(Sem descrição detalhada)'];
      }

      const idText = a.identificador || 'S/ ID';

      // Parse materials robustly
      const matList = parseMaterial(a.material);
      let printMat = '';
      if (matList.length > 0) {
        printMat = matList.map(m => `<div style="margin-bottom: 4px; display:flex; align-items:flex-start; gap:4px;"><span style="font-size: 9px; white-space: pre-wrap;">• ${m}</span></div>`).join('');
      }

      // Also try to get materials from atividades_materiais if it exists
      if (!printMat && a.atividades_materiais) {
        const matFromAtiv = parseMaterial(a.atividades_materiais);
        if (matFromAtiv.length > 0) {
          printMat = matFromAtiv.map(m => `<div style="margin-bottom: 4px; display:flex; align-items:flex-start; gap:4px;"><span style="font-size: 9px; white-space: pre-wrap;">• ${m}</span></div>`).join('');
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
      <div class="signature-line">Assinatura do Técnico / Executante</div>
      <div class="signature-line">Assinatura do Supervisor</div>
      <div class="signature-line">Data de Execução</div>
    </div>
  `;

  container.innerHTML = htmlContent;

  const opt = {
    margin:       0.4,
    filename:     `Checklist_Preventiva_${linha}_${mes}.pdf`,
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };

  try {
    await html2pdf().set(opt).from(container.outerHTML).save();
  } catch (err) {
    console.error('Erro na exportacao PDF:', err);
  }
}
