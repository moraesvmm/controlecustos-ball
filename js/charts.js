import {
  agregarPorStatus,
  agregarRecebidosPrevistos,
  agregarPorMaquina,
  agregarPrazosRetorno,
} from './logic.js?v=999';
import { abrirDrilldown, registrosPorClique } from './drilldown.js?v=999';
import { fmtMoeda } from './ui.js?v=999';

const COLORS = {
  ENTREGUE: ['rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'],
  'PENDENTE DE ENTREGA': ['rgba(251, 191, 36, 0.9)', 'rgba(245, 158, 11, 0.35)'],
  'PENDENTE DE PEDIDO': ['rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.35)'],
  'PENDENTE DE ORCAMENTO': ['rgba(192, 132, 252, 0.9)', 'rgba(168, 85, 247, 0.35)'],
  PENDENTE: ['rgba(148, 163, 184, 0.9)', 'rgba(100, 116, 139, 0.35)'],
};

const CHART_FONT = { fontFamily: "'DM Sans', system-ui", fontSize: 12 };
let chartInstances = [];
let registrosRef = [];
let crudMesChartInstance = null;

function themeColors() {
  const isLight = document.body.classList.contains('light-mode');
  return {
    legendColor:  isLight ? '#334155' : '#cbd5e1',
    titleColor:   isLight ? '#0f172a' : '#f8fafc',
    tickColor:    isLight ? '#64748b' : '#94a3b8',
    gridColor:    isLight ? 'rgba(100,116,139,0.12)' : 'rgba(148,163,184,0.08)',
    tooltipBg:    isLight ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.95)',
    tooltipTitle: isLight ? '#0f172a' : '#f1f5f9',
    tooltipText:  isLight ? '#334155' : '#cbd5e1',
    borderColor:  isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)',
    pointerShadow: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    pieBorder:    isLight ? '#ffffff' : '#0f172a',
    shadowColor:  isLight ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.4)',
  };
}

function gradient(c1, c2, horizontal = false) {
  if (horizontal) {
      return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: c1 },
        { offset: 1, color: c2 }
      ]);
  }
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: c1 },
    { offset: 1, color: c2 }
  ]);
}

const fmtLabel = (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v);

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
        table += `<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${typeof val === 'number' ? fmtMoeda(val) : (val||'—')}</td>`;
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
        table += `<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${typeof val === 'number' ? fmtMoeda(val) : (val||'—')}</td>`;
      });
      table += '</tr>';
    }
  } else {
    series.forEach(s => {
      table += `<tr><th colspan="2" style="padding:8px;border-bottom:1px solid var(--border,#334155);">${s.name || 'Dados'}</th></tr>`;
      s.data.forEach(d => {
        let name = d.name || 'Item';
        let val = d.value;
        let formatted = (s.isCount) ? val : (typeof val === 'number' ? fmtMoeda(val) : (val||'—'));
        table += `<tr><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${name}</td><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${formatted}</td></tr>`;
      });
    });
  }
  table += '</tbody></table></div>';
  return table;
};

function makeClickHandler(chartId) {
  return (params) => {
    try {
      const label = params.name;
      const datasetLabel = params.seriesName;
      
      const regs = registrosPorClique(
        chartId === 'mes' ? 'mes-dataset' : chartId,
        label,
        datasetLabel,
        registrosRef
      );

      const titulos = {
        status: `Custos: ${label}`,
        mes: `${datasetLabel || 'Valores'} — ${label}`,
        maquina: `Gastos: ${label}`,
      };
      const chartKey = chartId === 'mes' ? 'mes' : chartId;

      const total = regs.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      abrirDrilldown({
        titulo: titulos[chartKey] || `${datasetLabel} — ${label}`,
        subtitulo: chartKey === 'prazos' ? `${regs.length} iten(s) nesta faixa` : `${regs.length} registro(s) · Total ${fmtMoeda(total)}`,
        registros: regs,
        meta: {
          isPrazosCard: chartKey === 'prazos',
          insight:
            chartKey === 'status'
              ? `Este status representa ${((total / (registrosRef.reduce((a, r) => a + (Number(r.valor) || 0), 0) || 1)) * 100).toFixed(1)}% do valor filtrado no dashboard.`
              : chartKey === 'maquina'
                ? 'Considere priorizar manutenção preventiva se o custo concentrar em uma única máquina/linha.'
                : chartKey === 'prazos'
                  ? 'Acompanhe os itens atrasados para evitar gargalos na produção.'
                  : 'Compare previsto vs recebido para ajustar fluxo de caixa do mês.',
        },
      });
    } catch (err) {
      console.error("Erro no clique do grafico:", err);
      alert("Erro ao abrir detalhamento: " + err.message);
    }
  };
}

export function destroyCharts() {
  chartInstances.forEach((c) => {
    if (c && !c.isDisposed()) c.dispose();
  });
  chartInstances = [];
}

export function destroyCrudMesChart() {
  if (crudMesChartInstance && !crudMesChartInstance.isDisposed()) {
    crudMesChartInstance.dispose();
    crudMesChartInstance = null;
  }
}

// Window resize handler for all charts
window.addEventListener('resize', () => {
    chartInstances.forEach(c => {
        if(c && !c.isDisposed()) c.resize();
    });
    if (crudMesChartInstance && !crudMesChartInstance.isDisposed()) crudMesChartInstance.resize();
});

export function renderCrudMesChart(registros, titulo = 'PREVISTOS X RECEBIDOS') {
  destroyCrudMesChart();
  registrosRef = registros;

  const ctx = document.getElementById('chartCrudMes');
  if (!ctx) return;

  const byMes = agregarRecebidosPrevistos(registros);
  const tc = themeColors();

  crudMesChartInstance = echarts.init(ctx);
  const option = {
    title: { text: titulo, textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
    tooltip: { 
        trigger: 'item', 
        backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
        valueFormatter: (value) => fmtMoeda(value)
    },
    legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: byMes.map((x) => x.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
    series: [
      {
        name: 'Valor Previsto',
        type: 'bar',
        data: byMes.map((x) => x.previsto),

        itemStyle: { color: gradient('rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'), borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Valor Recebido',
        type: 'bar',
        data: byMes.map((x) => x.recebido),

        itemStyle: { color: gradient('rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'), borderRadius: [8, 8, 0, 0] }
      }
    ]
  };
  crudMesChartInstance.setOption(option);
  crudMesChartInstance.on('click', makeClickHandler('mes'));
}

export function renderDashboardCharts(registros) {
  destroyCharts();
  registrosRef = registros;

  const tc = themeColors();
  const byStatus = agregarPorStatus(registros);
  const byMes = agregarRecebidosPrevistos(registros);
  const byMaquina = agregarPorMaquina(registros)
    .filter(x => x.valor > 0)
    .sort((a, b) => a.valor - b.valor); // Sort asc for horizontal chart in Echarts

  const ignoredStatuses = ['PENDENTE', 'PENDENTE DE ENVIO', 'PENDENTE DE RC', 'PENDENTE DE ORÇAMENTO', 'PENDENTE DE ORCAMENTO'];
  const byStatusFiltered = byStatus.filter(x => !ignoredStatuses.includes(x.status));

  // CHART STATUS
  const ctx1 = document.getElementById('chartStatus');
  if (ctx1) {
    const ch1 = echarts.init(ctx1);
    ch1.setOption({
      title: { text: 'STATUS × CUSTO', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      toolbox: {
        feature: {
          magicType: { type: ['line', 'bar'] },
          dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: tc.tooltipBg, textareaColor: tc.tooltipBg, textareaBorderColor: tc.borderColor, textColor: tc.tooltipText, buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
          saveAsImage: { show: true, title: 'Salvar Imagem' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: byStatusFiltered.map(x => x.status), axisLabel: { color: tc.tickColor, ...CHART_FONT, interval: 0, formatter: (v) => v.replace(' DE ', '\nDE ') }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [{
        name: 'Soma de VALOR',
        type: 'bar',

        data: byStatusFiltered.map((x) => {
            const colorTuple = COLORS[x.status] || COLORS['PENDENTE'];
            return {
                value: x.valor,
                itemStyle: { color: gradient(colorTuple[0], colorTuple[1]), borderRadius: [8, 8, 0, 0] }
            }
        }),
        markPoint: {
          data: [
            { type: 'max', name: 'Maior Custo' },
            { type: 'min', name: 'Menor Custo' }
          ],
          label: { color: '#fff', fontSize: 10, fontWeight: 600, formatter: (p) => fmtLabel(p.value) }
        },
        animationDelay: (idx) => idx * 100,
        animationEasing: 'elasticOut'
      }]
    });
    ch1.on('click', makeClickHandler('status'));
    chartInstances.push(ch1);
    ctx1.closest('.chart-box')?.classList.remove('skeleton');
  }

  // CHART MES
  const ctx2 = document.getElementById('chartMes');
  if (ctx2) {
    const ch2 = echarts.init(ctx2);
    ch2.setOption({
      title: { text: 'RECEBIDOS E PREVISTOS', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      toolbox: {
        feature: {
          magicType: { type: ['line', 'bar'] },
          dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: tc.tooltipBg, textareaColor: tc.tooltipBg, textareaBorderColor: tc.borderColor, textColor: tc.tooltipText, buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
          saveAsImage: { show: true, title: 'Salvar' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: byMes.map((x) => x.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [
        {
          name: 'Valor Previsto',
          type: 'bar',
          data: byMes.map((x) => x.previsto),
  
          itemStyle: { color: gradient('rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'), borderRadius: [8, 8, 0, 0] },
          animationDelay: (idx) => idx * 50
        },
        {
          name: 'Valor Recebido',
          type: 'bar',
          data: byMes.map((x) => x.recebido),
  
          itemStyle: { color: gradient('rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'), borderRadius: [8, 8, 0, 0] },
          animationDelay: (idx) => idx * 50 + 20
        }
      ]
    });
    ch2.on('click', makeClickHandler('mes'));
    chartInstances.push(ch2);
    ctx2.closest('.chart-box')?.classList.remove('skeleton');
  }

  // CHART MAQUINA
  const ctx3 = document.getElementById('chartMaquina');
  if (ctx3) {
    const ch3 = echarts.init(ctx3);
    ch3.setOption({
      title: { text: 'GASTOS POR MÁQUINA / LINHA', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      toolbox: {
        feature: {
          dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: tc.tooltipBg, textareaColor: tc.tooltipBg, textareaBorderColor: tc.borderColor, textColor: tc.tooltipText, buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
          saveAsImage: { show: true, title: 'Salvar' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      dataZoom: [
        { type: 'slider', yAxisIndex: 0, show: true, right: '2%', width: 12, startValue: byMaquina.length > 10 ? byMaquina.length - 10 : 0, endValue: byMaquina.length - 1, fillerColor: 'rgba(99,102,241,0.2)', borderColor: 'none', handleSize: 0, showDetail: false },
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true }
      ],
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      grid: { left: '3%', right: '12%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
      yAxis: { type: 'category', data: byMaquina.map(x => x.maquina_linha.length > 25 ? x.maquina_linha.substring(0,25) + '...' : x.maquina_linha), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        name: 'Valor Recebido',
        type: 'bar',
        data: byMaquina.map(x => ({ value: x.valor, name: x.maquina_linha })), // Keep full name in data point
        barWidth: '60%',

        itemStyle: { color: gradient('rgba(212, 175, 55, 0.95)', 'rgba(180, 140, 40, 0.45)', true), borderRadius: [0, 8, 8, 0] },
        animationDelay: (idx) => idx * 30
      }]
    });
    ch3.on('click', (params) => {
        makeClickHandler('maquina')({ ...params, name: params.data.name });
    });
    chartInstances.push(ch3);
    ctx3.closest('.chart-box')?.classList.remove('skeleton');
  }

  // --- Gráficos de Pizza (Prazos de Retorno) ---
  const prazosColors = {
    'Em dias': gradient('rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.4)'),
    'Pendente de retorno': gradient('rgba(251, 191, 36, 0.9)', 'rgba(245, 158, 11, 0.4)'),
    'Atrasado para retorno': gradient('rgba(248, 113, 113, 0.9)', 'rgba(239, 68, 68, 0.4)')
  };

  function renderPrazoChart(canvasId, title, natureza) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = agregarPrazosRetorno(registros, natureza);

    const ch = echarts.init(ctx);
    ch.setOption({
      title: { text: title, textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      toolbox: {
        feature: {
          dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: tc.tooltipBg, textareaColor: tc.tooltipBg, textareaBorderColor: tc.borderColor, textColor: tc.tooltipText, buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
          saveAsImage: { show: true, title: 'Salvar' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, borderColor: tc.borderColor,
          formatter: '{b}: {c} item(ns) ({d}%)',
          textStyle: { color: tc.tooltipText, fontWeight: 500 }
      },
      legend: { bottom: 0, textStyle: { color: tc.legendColor, ...CHART_FONT } },
      series: [{
        name: natureza,
        type: 'pie',
        isCount: true,
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        itemStyle: { 
            borderColor: tc.pieBorder, 
            borderWidth: 3, 
            borderRadius: 8
        },
        data: data.map(d => ({
            name: d.label,
            value: d.qtde,
            itemStyle: { color: prazosColors[d.label] }
        })),
        label: { 
            show: true, 
            formatter: '{b}\n{d}%',
            color: tc.titleColor,
            fontFamily: 'Inter',
            fontWeight: 600,
            lineHeight: 16
        },
        labelLine: {
            show: true,
            smooth: 0.2,
            length: 10,
            length2: 15,
            lineStyle: { width: 2, color: tc.tickColor }
        },
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: (idx) => Math.random() * 200
      }]
    });
    ch.on('click', makeClickHandler('prazos'));
    chartInstances.push(ch);
  }

  renderPrazoChart('chartConsertoDias', 'CONSERTO', 'CONSERTO');
  renderPrazoChart('chartComprasDias', 'COMPRAS', 'COMPRA');
}

// =====================================================
// GRÁFICO: FLUXO DE CONSERTOS (Enviado vs Recebido)
// =====================================================
let fluxoChartInstance = null;

export function destroyFluxoChart() {
  if (fluxoChartInstance && !fluxoChartInstance.isDisposed()) { 
    fluxoChartInstance.dispose(); 
    fluxoChartInstance = null; 
  }
}

export function agregarFluxoConsertos(registros, anoAlvo, mesAlvo = null) {
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const map = {};

  const bucket = (key) => {
    if (!map[key]) map[key] = { mes: key, enviado: 0, recebido: 0, itensEnviados: [], itensRecebidos: [] };
    return map[key];
  };

  if (mesAlvo !== null) bucket(MESES[mesAlvo]);
  else MESES.forEach(m => bucket(m));

  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(String(v).slice(0, 10));
    return isNaN(d.getTime()) ? null : d;
  };

  for (const r of registros) {
    const ds = parseDate(r.data_saida);
    if (ds && ds.getFullYear() === anoAlvo) {
      const m = ds.getMonth();
      if (mesAlvo === null || m === mesAlvo) {
        const key = MESES[m];
        bucket(key).enviado += Number(r.valoracao) || 0;
        bucket(key).itensEnviados.push(r);
      }
    }
    const dr = parseDate(r.data_recebimento);
    if (dr && dr.getFullYear() === anoAlvo) {
      const m = dr.getMonth();
      if (mesAlvo === null || m === mesAlvo) {
        const key = MESES[m];
        bucket(key).recebido += Number(r.valor) || 0;
        bucket(key).itensRecebidos.push(r);
      }
    }
  }
  return MESES.filter(m => map[m]).map(m => map[m]);
}

export function renderConsertoFluxoChart(canvasId, registros, anoAlvo, mesAlvo = null) {
  destroyFluxoChart();
  registrosRef = registros;

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const dados = agregarFluxoConsertos(registros, anoAlvo, mesAlvo);
  const tc = themeColors();

  fluxoChartInstance = echarts.init(ctx);
  fluxoChartInstance.setOption({
    title: { text: 'FLUXO DE CONSERTOS — Patrimonial Exposto vs. Custo de Reparo', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
    toolbox: {
      feature: {
        magicType: { type: ['line', 'bar'] },
        dataView: { show: true, readOnly: true, title: 'Tabela de Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'], backgroundColor: tc.tooltipBg, textareaColor: tc.tooltipBg, textareaBorderColor: tc.borderColor, textColor: tc.tooltipText, buttonColor: '#38bdf8', buttonTextColor: '#0f172a', optionToContent: formatDataView },
        saveAsImage: { show: true, title: 'Salvar' }
      },
      iconStyle: { borderColor: tc.tickColor }
    },
    dataZoom: [
      { type: 'slider', xAxisIndex: 0, show: true, bottom: '2%', height: 12, startValue: 0, endValue: 11, fillerColor: 'rgba(99,102,241,0.2)', borderColor: 'none', handleSize: 0, showDetail: false },
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: true }
    ],
    tooltip: { 
        trigger: 'item', 
        backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
        valueFormatter: (value) => fmtMoeda(value)
    },
    legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dados.map(d => d.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
    series: [
      {
        name: 'Patrimonial Exposto (Enviado)',
        type: 'bar',
        data: dados.map(d => d.enviado),

        itemStyle: { color: gradient('rgba(251,191,36,0.9)', 'rgba(245,158,11,0.35)'), borderRadius: [8, 8, 0, 0] },
        animationDelay: (idx) => idx * 50
      },
      {
        name: 'Custo Reparo (Recebido)',
        type: 'bar',
        data: dados.map(d => d.recebido),

        itemStyle: { color: gradient('rgba(52,211,153,0.9)', 'rgba(16,185,129,0.35)'), borderRadius: [8, 8, 0, 0] },
        animationDelay: (idx) => idx * 50 + 20
      }
    ]
  });

  fluxoChartInstance.on('click', (params) => {
    const mesLabel = params.name;
    const dsLabel = params.seriesName;
    const dadoMes = dados.find(d => d.mes === mesLabel);
    if (!dadoMes) return;
    const regs = dsLabel.includes('Enviado') ? dadoMes.itensEnviados : dadoMes.itensRecebidos;
    const total = regs.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    abrirDrilldown({
      titulo: `${dsLabel} — ${mesLabel}`,
      subtitulo: `${regs.length} item(ns) · Total ${fmtMoeda(total)}`,
      registros: regs,
      meta: { insight: dsLabel.includes('Enviado')
        ? 'Valor patrimonial total dos itens que saíram para conserto neste período.'
        : 'Custo total de reparo dos itens que retornaram neste período.' }
    });
  });
}
