import {
  agregarPorStatus,
  agregarRecebidosPrevistos,
  agregarPorMaquina,
  agregarPrazosRetorno,
} from './logic.js?v=999';
import { abrirDrilldown, registrosPorClique } from './drilldown.js?v=999';
import { fmtMoeda } from './ui.js?v=999';

export function getThemeMode() {
  if (document.body.classList.contains('navy-mode')) return 'navy';
  if (document.body.classList.contains('purple-mode')) return 'purple';
  if (document.body.classList.contains('light-mode')) return 'light';
  return 'dark';
}

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

export function getThemePalette() {
  const mode = getThemeMode();
  if (mode === 'navy') {
    return {
      primary: ['rgba(37, 99, 235, 0.95)', 'rgba(30, 64, 175, 0.45)'],     // Blue 600
      secondary: ['rgba(59, 130, 246, 0.95)', 'rgba(37, 99, 235, 0.45)'],  // Blue 500 (Brighter Blue)
      tertiary: ['rgba(30, 58, 138, 0.95)', 'rgba(23, 37, 84, 0.45)'],     // Blue 900 (Deep Navy)
      accent: ['rgba(14, 165, 233, 0.95)', 'rgba(2, 132, 199, 0.45)']       // Light Blue
    };
  }
  if (mode === 'purple') {
    return {
      primary: ['rgba(124, 58, 237, 0.95)', 'rgba(109, 40, 217, 0.45)'],    // Violet
      secondary: ['rgba(236, 72, 153, 0.95)', 'rgba(219, 39, 119, 0.45)'],  // Pink
      tertiary: ['rgba(168, 85, 247, 0.95)', 'rgba(147, 51, 234, 0.45)'],   // Purple
      accent: ['rgba(99, 102, 241, 0.95)', 'rgba(79, 70, 229, 0.45)']       // Indigo
    };
  }
  // Default legacy palette for dark/light (Golden/Green/Blue)
  return {
    primary: ['rgba(212, 175, 55, 0.95)', 'rgba(180, 140, 40, 0.45)'], // Gold
    secondary: ['rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'], // Green
    tertiary: ['rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.35)'],  // Blue
    accent: ['rgba(251, 191, 36, 0.9)', 'rgba(245, 158, 11, 0.35)']     // Yellow
  };
}

export function getColorsByStatus(status) {
  const mode = getThemeMode();
  const base = {
    ENTREGUE: ['rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'],
    'PENDENTE DE ENTREGA': ['rgba(251, 191, 36, 0.9)', 'rgba(245, 158, 11, 0.35)'],
    'PENDENTE DE PEDIDO': ['rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.35)'],
    'PENDENTE DE ORCAMENTO': ['rgba(192, 132, 252, 0.9)', 'rgba(168, 85, 247, 0.35)'],
    PENDENTE: ['rgba(148, 163, 184, 0.9)', 'rgba(100, 116, 139, 0.35)'],
  };

  if (mode === 'dark' || mode === 'light') return base[status] || base.PENDENTE;

  const palette = getThemePalette();
  if (status === 'ENTREGUE') return palette.primary;
  if (status === 'PENDENTE DE ENTREGA') return palette.tertiary;
  if (status === 'PENDENTE DE PEDIDO') return palette.secondary;
  if (status === 'PENDENTE DE ORCAMENTO') return palette.accent;
  return ['rgba(148, 163, 184, 0.9)', 'rgba(100, 116, 139, 0.35)'];
}

export function themeColors() {
  const mode = getThemeMode();
  const isLight = mode === 'light';
  const isNavy = mode === 'navy';
  const isPurple = mode === 'purple';
  
  return {
    legendColor:  isLight ? '#475569' : '#cbd5e1',
    titleColor:   isLight ? '#0f172a' : (isNavy ? '#eff6ff' : (isPurple ? '#faf5ff' : '#f8fafc')),
    tickColor:    isLight ? '#94a3b8' : (isNavy ? '#93c5fd' : (isPurple ? '#d8b4fe' : '#94a3b8')),
    gridColor:    isLight ? 'rgba(15,23,42,0.06)' : (isNavy ? 'rgba(59,130,246,0.1)' : (isPurple ? 'rgba(168,85,247,0.1)' : 'rgba(148,163,184,0.08)')),
    tooltipBg:    isLight ? 'rgba(255,255,255,0.98)' : (isNavy ? 'rgba(15,23,42,0.95)' : (isPurple ? 'rgba(15,23,42,0.95)' : 'rgba(15,23,42,0.95)')),
    tooltipTitle: isLight ? '#0f172a' : (isNavy ? '#93c5fd' : (isPurple ? '#d8b4fe' : '#f1f5f9')),
    tooltipText:  isLight ? '#475569' : '#cbd5e1',
    borderColor:  isLight ? 'rgba(15,23,42,0.1)' : (isNavy ? 'rgba(59,130,246,0.2)' : (isPurple ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.1)')),
    pointerShadow: isLight ? 'rgba(15,23,42,0.03)' : (isNavy ? 'rgba(59,130,246,0.05)' : (isPurple ? 'rgba(168,85,247,0.05)' : 'rgba(255,255,255,0.04)')),
    pieBorder:    isLight ? '#ffffff' : '#0f172a',
    shadowColor:  isLight ? 'rgba(15,23,42,0.1)' : (isNavy ? 'rgba(30,64,175,0.5)' : (isPurple ? 'rgba(109,40,217,0.5)' : 'rgba(0,0,0,0.4)')),
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

let heroHealthChartInstance = null;
let heroSparklineChartInstance = null;

window.renderHeroEcharts = function (previsto, recebido, healthScore) {
  const tc = themeColors();
  
  const healthCtx = document.getElementById('chartHealthScore');
  if (healthCtx) {
    if (heroHealthChartInstance && !heroHealthChartInstance.isDisposed()) {
      heroHealthChartInstance.dispose();
    }
    heroHealthChartInstance = echarts.init(healthCtx);
    const color = healthScore >= 80 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : '#ef4444';
    
    heroHealthChartInstance.setOption({
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          center: ['50%', '70%'],
          radius: '100%',
          min: 0,
          max: 100,
          splitNumber: 1,
          itemStyle: {
            color: color,
            shadowColor: 'rgba(0,0,0,0.2)',
            shadowBlur: 5,
            shadowOffsetX: 1,
            shadowOffsetY: 1
          },
          progress: {
            show: true,
            roundCap: true,
            width: 8
          },
          pointer: { show: false },
          axisLine: {
            roundCap: true,
            lineStyle: { width: 8, color: [[1, tc.gridColor]] }
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { show: false },
          detail: { show: false },
          data: [{ value: healthScore }]
        }
      ]
    });
    // Adiciona na lista de instâncias para resize automático
    if (!chartInstances.includes(heroHealthChartInstance)) {
        chartInstances.push(heroHealthChartInstance);
    }
  }

  const sparkCtx = document.getElementById('kpiPrevRecSparkline');
  if (sparkCtx) {
    if (heroSparklineChartInstance && !heroSparklineChartInstance.isDisposed()) {
      heroSparklineChartInstance.dispose();
    }
    heroSparklineChartInstance = echarts.init(sparkCtx);
    heroSparklineChartInstance.setOption({
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: { type: 'category', show: false, data: ['Previsto', 'Recebido'] },
      yAxis: { type: 'value', show: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tc.tooltipBg,
        textStyle: { color: tc.tooltipText, fontSize: 10 },
        borderColor: tc.borderColor,
        padding: [4, 8],
        formatter: (p) => `${p[0].name}: ${fmtMoeda(p[0].value)}`,
        axisPointer: { type: 'none' }
      },
      series: [
        {
          data: [
            { value: previsto, itemStyle: { color: tc.tickColor, borderRadius: [2, 2, 0, 0] } },
            { value: recebido, itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] } }
          ],
          type: 'bar',
          barWidth: '60%'
        }
      ]
    });
    if (!chartInstances.includes(heroSparklineChartInstance)) {
        chartInstances.push(heroSparklineChartInstance);
    }
  }
};

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
        if(c && !c.isDisposed() && c.getDom().clientWidth > 0) c.resize();
    });
    if (crudMesChartInstance && !crudMesChartInstance.isDisposed() && crudMesChartInstance.getDom().clientWidth > 0) crudMesChartInstance.resize();
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

        itemStyle: { color: gradient(getThemePalette().tertiary[0], getThemePalette().tertiary[1]), borderRadius: [8, 8, 0, 0] }
      },
      {
        name: 'Valor Recebido',
        type: 'bar',
        data: byMes.map((x) => x.recebido),

        itemStyle: { color: gradient(getThemePalette().secondary[0], getThemePalette().secondary[1]), borderRadius: [8, 8, 0, 0] }
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
      title: { text: 'STATUS × CUSTO', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 13, fontWeight: 600 } },
      toolbox: {
        top: 25,
        left: 0,
        itemSize: 12,
        feature: {
          magicType: { type: ['line', 'bar'] },
          dataView: { show: true, readOnly: true, title: 'Dados' },
          saveAsImage: { show: true, title: 'Salvar' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
      xAxis: { type: 'category', data: byStatusFiltered.map(x => x.status), axisLabel: { color: tc.tickColor, ...CHART_FONT, interval: 0, rotate: 45, width: 80, overflow: 'break', formatter: (v) => v.replace(' DE ', '\nDE ') }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [{
        name: 'Soma de VALOR',
        type: 'bar',

        data: byStatusFiltered.map((x) => {
            const colorTuple = getColorsByStatus(x.status);
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
      title: { text: 'RECEBIDOS E PREVISTOS', textStyle: { color: tc.titleColor, ...CHART_FONT, fontSize: 13, fontWeight: 600 } },
      toolbox: {
        top: 0,
        right: 0,
        itemSize: 12,
        feature: {
          magicType: { type: ['line', 'bar'] },
          dataView: { show: true, readOnly: true, title: 'Dados' },
          saveAsImage: { show: true, title: 'Salvar' }
        },
        iconStyle: { borderColor: tc.tickColor }
      },
      tooltip: { 
          trigger: 'item', 
          backgroundColor: tc.tooltipBg, textStyle: { color: tc.tooltipText }, borderColor: tc.borderColor,
          valueFormatter: (value) => fmtMoeda(value)
      },
      legend: { textStyle: { color: tc.legendColor, ...CHART_FONT }, bottom: 0, padding: 0 },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: byMes.map((x) => x.mes), axisLabel: { color: tc.tickColor, ...CHART_FONT }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: fmtLabel }, splitLine: { lineStyle: { color: tc.gridColor } } },
      series: [
        {
          name: 'Valor Previsto',
          type: 'bar',
          data: byMes.map((x) => x.previsto),
  
          itemStyle: { color: gradient(getThemePalette().tertiary[0], getThemePalette().tertiary[1]), borderRadius: [8, 8, 0, 0] },
          animationDelay: (idx) => idx * 50
        },
        {
          name: 'Valor Recebido',
          type: 'bar',
          data: byMes.map((x) => x.recebido),
  
          itemStyle: { color: gradient(getThemePalette().secondary[0], getThemePalette().secondary[1]), borderRadius: [8, 8, 0, 0] },
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
        top: 25,
        left: 0,
        itemSize: 12,
        feature: {
          dataView: { show: true, readOnly: true, title: 'Dados' },
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

        itemStyle: { color: gradient(getThemePalette().primary[0], getThemePalette().primary[1], true), borderRadius: [0, 8, 8, 0] },
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
    'Em dias': gradient('rgba(16, 185, 129, 0.9)', 'rgba(5, 150, 105, 0.4)'), // Emerald Green
    'Pendente de retorno': gradient('rgba(245, 158, 11, 0.9)', 'rgba(217, 119, 6, 0.4)'), // Amber/Yellow
    'Atrasado para retorno': gradient('rgba(248, 113, 113, 0.9)', 'rgba(239, 68, 68, 0.4)') // Red
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

        itemStyle: { color: gradient(getThemePalette().accent[0], getThemePalette().accent[1]), borderRadius: [8, 8, 0, 0] },
        animationDelay: (idx) => idx * 50
      },
      {
        name: 'Custo Reparo (Recebido)',
        type: 'bar',
        data: dados.map(d => d.recebido),

        itemStyle: { color: gradient(getThemePalette().secondary[0], getThemePalette().secondary[1]), borderRadius: [8, 8, 0, 0] },
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

// =====================================================
// GRÁFICOS: CONFIABILIDADE — MTBF / MTTR / INDISP
// =====================================================
const confiabCharts = { mtbf: null, mttr: null, indisp: null, mtta: null };

export function destroyConfiabCharts() {
  ['mtbf', 'mttr', 'indisp', 'mtta'].forEach(k => {
    if (confiabCharts[k] && !confiabCharts[k].isDisposed()) {
      confiabCharts[k].dispose();
      confiabCharts[k] = null;
    }
  });
}

window.addEventListener('resize', () => {
  ['mtbf', 'mttr', 'indisp', 'mtta'].forEach(k => {
    if (confiabCharts[k] && !confiabCharts[k].isDisposed() && confiabCharts[k].getDom().clientWidth > 0) confiabCharts[k].resize();
  });
});

/**
 * Renderiza os 3 gráficos de confiabilidade lado a lado.
 * @param {Array}  dados   - Lista de {periodo_ref, mtbf_h, mttr_h, indisponibilidade_pct, linha}
 * @param {Object} metas   - {meta_mtbf_h, meta_mttr_h, meta_indisponibilidade_pct} (média das linhas se múltiplas)
 * @param {String} linha   - "TODAS" ou nome da linha (para legenda)
 */
export function renderConfiabilidadeCharts(dados, metas, linha = 'TODAS') {
  destroyConfiabCharts();

  const tc = themeColors();

  // Agrupa por periodo_ref (soma avg quando múltiplas linhas)
  const byPeriodo = {};
  for (const d of dados) {
    if (!byPeriodo[d.periodo_ref]) {
      byPeriodo[d.periodo_ref] = { mtbf: [], mttr: [], indisp: [], mtta: [] };
    }
    byPeriodo[d.periodo_ref].mtbf.push(d.mtbf_h);
    byPeriodo[d.periodo_ref].mttr.push(d.mttr_h);
    byPeriodo[d.periodo_ref].indisp.push(d.indisponibilidade_pct);
    byPeriodo[d.periodo_ref].mtta.push(d.mtta_m || 0);
  }

  // Ordena períodos (cronológico para meses, alfabético para semanas S01)
  const mesesOrder = {
    'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
    'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12
  };
  const periodos = Object.keys(byPeriodo).sort((a, b) => {
    if (mesesOrder[a] && mesesOrder[b]) return mesesOrder[a] - mesesOrder[b];
    return a.localeCompare(b);
  });
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const vMtbf  = periodos.map(p => +avg(byPeriodo[p].mtbf).toFixed(2));
  const vMttr  = periodos.map(p => +avg(byPeriodo[p].mttr).toFixed(2));
  const vIndisp = periodos.map(p => +avg(byPeriodo[p].indisp).toFixed(2));
  const vMtta = periodos.map(p => +avg(byPeriodo[p].mtta).toFixed(2));

  // Configuração de Cores Premium (Neon)
  const chartConfig = {
    mtbf: {
      color: '#10b981',
      gradArea: [
        { offset: 0, color: 'rgba(16, 185, 129, 0.4)' },
        { offset: 1, color: 'rgba(16, 185, 129, 0.0)' }
      ]
    },
    mttr: {
      color: '#f59e0b',
      gradArea: [
        { offset: 0, color: 'rgba(245, 158, 11, 0.4)' },
        { offset: 1, color: 'rgba(245, 158, 11, 0.0)' }
      ]
    },
    indisp: {
      color: '#ef4444',
      gradArea: [
        { offset: 0, color: 'rgba(239, 68, 68, 0.4)' },
        { offset: 1, color: 'rgba(239, 68, 68, 0.0)' }
      ]
    },
    mtta: {
      color: '#8b5cf6',
      gradArea: [
        { offset: 0, color: 'rgba(139, 92, 246, 0.4)' },
        { offset: 1, color: 'rgba(139, 92, 246, 0.0)' }
      ]
    }
  };

  function buildAdvancedChart(elId, values, metaVal, title, cfg, unit, isBiggerBetter) {
    const el = document.getElementById(elId);
    if (!el) return null;
    const inst = echarts.init(el);
    
    const baseColor = cfg.color;
    
    // Tooltip HTML customizado com distanciamento da meta
    const tooltipFormatter = params => {
      const p = params[0];
      const val = p.value;
      const diff = (val - metaVal).toFixed(2);
      
      let statusColor = tc.tickColor;
      let statusIcon = '';
      if (isBiggerBetter) {
        statusColor = val >= metaVal ? '#10b981' : '#ef4444';
        statusIcon = val >= metaVal ? '▲' : '▼';
      } else {
        statusColor = val <= metaVal ? '#10b981' : '#ef4444';
        statusIcon = val <= metaVal ? '▼' : '▲';
      }
      
      const diffText = diff > 0 ? `+${diff}` : `${diff}`;
      
      return `
        <div style="padding: 6px;">
          <div style="font-size: 11px; color: ${tc.tickColor}; margin-bottom: 4px; opacity: 0.8;">${p.name}</div>
          <div style="font-size: 15px; font-weight: 700; color: ${tc.titleColor}; margin-bottom: 4px;">
            ${title}: ${val}${unit}
          </div>
          <div style="font-size: 12px; color: ${statusColor}; font-weight: 600;">
            ${statusIcon} ${diffText}${unit} vs Meta
          </div>
        </div>
      `;
    };

    // Zonas de segurança baseadas na meta
    const goodColor = 'rgba(16, 185, 129, 0.07)';
    const badColor  = 'rgba(239, 68, 68, 0.07)';
    
    let markArea = {};
    if (isBiggerBetter) {
      markArea = {
        silent: true,
        data: [
          [ { yAxis: metaVal, itemStyle: { color: goodColor } }, { yAxis: 'max' } ],
          [ { yAxis: 'min', itemStyle: { color: badColor } }, { yAxis: metaVal } ]
        ]
      };
    } else {
      markArea = {
        silent: true,
        data: [
          [ { yAxis: 'min', itemStyle: { color: goodColor } }, { yAxis: metaVal } ],
          [ { yAxis: metaVal, itemStyle: { color: badColor } }, { yAxis: 'max' } ]
        ]
      };
    }

    // Determine if we have too many points (e.g., > 12 weeks)
    const tooManyPoints = values.length > 12;

    inst.setOption({
      animationDuration: 1500,
      animationEasing: 'cubicOut',
      toolbox: {
        show: true,
        right: '2%',
        top: '2%',
        feature: {
          magicType: { type: ['line', 'bar'], title: { line: 'Gráfico de Linha', bar: 'Gráfico de Barras' } },
          saveAsImage: { title: 'Salvar Imagem', name: title.replace(/[^a-zA-Z0-9]/g, '_') }
        },
        iconStyle: { borderColor: tc.tickColor, borderWidth: 1.5 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tc.tooltipBg,
        borderColor: tc.borderColor,
        borderWidth: 1,
        padding: 10,
        textStyle: { color: tc.tooltipText },
        formatter: tooltipFormatter,
        extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);'
      },
      grid: { left: '12%', right: '8%', top: '22%', bottom: tooManyPoints ? '22%' : '12%', containLabel: false },
      dataZoom: tooManyPoints ? [
        { type: 'slider', show: true, bottom: '2%', height: 16, borderColor: 'transparent', backgroundColor: tc.gridColor, fillerColor: 'rgba(255,255,255,0.1)', handleSize: '100%', textStyle: { color: tc.tickColor } },
        { type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true }
      ] : [],
      xAxis: {
        type: 'category',
        data: periodos,
        axisLabel: { color: tc.tickColor, ...CHART_FONT, rotate: periodos.length > 8 ? 35 : 0 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: tc.gridColor } },
        boundaryGap: values.length === 1 ? true : false
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: tc.tickColor, ...CHART_FONT, formatter: v => `${v}${unit}` },
        splitLine: { lineStyle: { color: tc.gridColor, type: 'dashed', opacity: 0.5 } }
      },
      series: [{
        type: values.length === 1 ? 'bar' : 'line',
        barWidth: '30%',
        data: values,
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: baseColor },
            { offset: 1, color: cfg.gradArea[1].color }
          ]),
          borderColor: values.length === 1 ? 'transparent' : tc.pieBorder,
          borderWidth: values.length === 1 ? 0 : 2,
          shadowColor: baseColor,
          shadowBlur: 8,
          borderRadius: [6, 6, 0, 0]
        },
        lineStyle: {
          width: 3,
          color: baseColor,
          shadowColor: baseColor,
          shadowBlur: 10
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, cfg.gradArea)
        },
        label: { 
          show: !tooManyPoints, 
          position: 'top', 
          fontSize: 11, 
          color: tc.tooltipTitle, 
          fontWeight: 600,
          formatter: p => `${p.value}${unit}`,
          backgroundColor: tc.tooltipBg,
          padding: [3, 6],
          borderRadius: 4
        },
        emphasis: {
          label: {
            show: true,
            position: 'top',
            fontSize: 12,
            color: tc.tooltipTitle,
            fontWeight: 'bold',
            formatter: p => `${p.value}${unit}`,
            backgroundColor: baseColor,
            padding: [4, 8],
            borderRadius: 4
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'solid', color: tc.tickColor, width: 1, opacity: 0.7 },
          label: { formatter: `Meta: ${metaVal}${unit}`, color: tc.tickColor, position: 'insideEndTop', fontSize: 10 },
          data: [{ yAxis: metaVal }]
        },
        markArea: markArea
      }]
    });
    inst.on('click', function(params) {
      if(window.abrirDrilldownMaquinas) {
        window.abrirDrilldownMaquinas(params.name);
      }
    });

    return inst;
  }

  confiabCharts.mtbf   = buildAdvancedChart('chartConfiabMtbf',   vMtbf,   metas.meta_mtbf_h,               'MTBF',              chartConfig.mtbf,   'h', true);
  confiabCharts.mttr   = buildAdvancedChart('chartConfiabMttr',   vMttr,   metas.meta_mttr_h,               'MTTR',              chartConfig.mttr,   'h', false);
  confiabCharts.indisp = buildAdvancedChart('chartConfiabIndisp', vIndisp, metas.meta_indisponibilidade_pct || 8, 'Indisponibilidade', chartConfig.indisp, '%', false);
  confiabCharts.mtta = buildAdvancedChart('chartMtta', vMtta, metas.meta_mtta_m || 30, 'MTTA', chartConfig.mtta, 'm', false);
}
