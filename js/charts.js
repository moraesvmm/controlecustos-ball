import {
  agregarPorStatus,
  agregarRecebidosPrevistos,
  agregarPorMaquina,
  agregarPrazosRetorno,
} from './logic.js?v=999';
import { abrirDrilldown, registrosPorClique } from './drilldown.js?v=999';
import { fmtMoeda } from './ui.js?v=999';

const COLORS = {
  ENTREGUE: '#34d399',
  'PENDENTE DE ENTREGA': '#fbbf24',
  'PENDENTE DE PEDIDO': '#60a5fa',
  'PENDENTE DE ORCAMENTO': '#c084fc',
  PENDENTE: '#94a3b8',
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
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
        valueFormatter: (value) => fmtMoeda(value)
    },
    legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: byMes.map((x) => x.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v) }, splitLine: { lineStyle: { color: tc.gridColor } } },
    series: [
      {
        name: 'Valor Previsto',
        type: 'bar',
        data: byMes.map((x) => x.previsto),
        itemStyle: { color: gradient('rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'), borderRadius: [6, 6, 0, 0] }
      },
      {
        name: 'Valor Recebido',
        type: 'bar',
        data: byMes.map((x) => x.recebido),
        itemStyle: { color: gradient('rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'), borderRadius: [6, 6, 0, 0] }
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
    .sort((a, b) => a.valor - b.valor) // Sort asc for horizontal chart in Echarts
    .slice(-10); // Take top 10

  const ignoredStatuses = ['PENDENTE', 'PENDENTE DE ENVIO', 'PENDENTE DE RC', 'PENDENTE DE ORÇAMENTO', 'PENDENTE DE ORCAMENTO'];
  const byStatusFiltered = byStatus.filter(x => !ignoredStatuses.includes(x.status));

  // CHART STATUS
  const ctx1 = document.getElementById('chartStatus');
  if (ctx1) {
    const ch1 = echarts.init(ctx1);
    ch1.setOption({
      title: { text: 'STATUS × CUSTO', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: byStatusFiltered.map(x => x.status), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v) }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [{
        name: 'Soma de VALOR',
        type: 'bar',
        data: byStatusFiltered.map((x) => ({
            value: x.valor,
            itemStyle: { color: COLORS[x.status] || '#64748b' }
        })),
        itemStyle: { borderRadius: [8, 8, 0, 0] }
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
      tooltip: { 
          trigger: 'axis', axisPointer: { type: 'shadow' },
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: byMes.map((x) => x.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v) }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [
        {
          name: 'Valor Previsto',
          type: 'bar',
          data: byMes.map((x) => x.previsto),
          itemStyle: { color: gradient('rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'), borderRadius: [6, 6, 0, 0] }
        },
        {
          name: 'Valor Recebido',
          type: 'bar',
          data: byMes.map((x) => x.recebido),
          itemStyle: { color: gradient('rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'), borderRadius: [6, 6, 0, 0] }
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
      title: { text: 'TOP 10 GASTOS POR MÁQUINA / LINHA', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      tooltip: { 
          trigger: 'axis', axisPointer: { type: 'shadow' },
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v) }, splitLine: { lineStyle: { color: tc.gridColor } } },
      yAxis: { type: 'category', data: byMaquina.map(x => x.maquina_linha.length > 25 ? x.maquina_linha.substring(0,25) + '...' : x.maquina_linha), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        name: 'Valor Recebido',
        type: 'bar',
        data: byMaquina.map(x => ({ value: x.valor, name: x.maquina_linha })), // Keep full name in data point
        barWidth: '60%',
        itemStyle: { color: gradient('rgba(212, 175, 55, 0.85)', 'rgba(180, 140, 40, 0.35)', true), borderRadius: [0, 8, 8, 0] }
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
    'Em dias': '#34d399',
    'Pendente de retorno': '#fbbf24',
    'Atrasado para retorno': '#f87171'
  };

  function renderPrazoChart(canvasId, title, natureza) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = agregarPrazosRetorno(registros, natureza);

    const ch = echarts.init(ctx);
    ch.setOption({
      title: { text: title, textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 14, fontWeight: 600 } },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          formatter: '{b}: {c} item(ns) ({d}%)'
      },
      legend: { bottom: 0, textStyle: { color: tc.legendColor, ...CHART_FONT } },
      series: [{
        name: natureza,
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '55%'],
        itemStyle: { borderColor: tc.borderColor, borderWidth: 2 },
        data: data.map(d => ({
            name: d.label,
            value: d.qtde,
            itemStyle: { color: prazosColors[d.label] }
        })),
        label: { show: false }
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
    tooltip: { 
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
        valueFormatter: (value) => fmtMoeda(value)
    },
    legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, top: 25 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dados.map(d => d.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: (v) => 'R$ ' + (v/1000 >= 1 ? (v/1000).toFixed(0) + 'k' : v) }, splitLine: { lineStyle: { color: tc.gridColor } } },
    series: [
      {
        name: 'Patrimonial Exposto (Enviado)',
        type: 'bar',
        data: dados.map(d => d.enviado),
        itemStyle: { color: gradient('rgba(251,191,36,0.9)', 'rgba(245,158,11,0.35)'), borderRadius: [6, 6, 0, 0] }
      },
      {
        name: 'Custo Reparo (Recebido)',
        type: 'bar',
        data: dados.map(d => d.recebido),
        itemStyle: { color: gradient('rgba(52,211,153,0.9)', 'rgba(16,185,129,0.35)'), borderRadius: [6, 6, 0, 0] }
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
