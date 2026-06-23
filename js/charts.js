import {
  agregarPorStatus,
  agregarRecebidosPrevistos,
  agregarPorMaquina,
  agregarPrazosRetorno,
} from './logic.js?v=9';
import { abrirDrilldown, registrosPorClique } from './drilldown.js?v=4';
import { fmtMoeda } from './ui.js?v=2';

const COLORS = {
  ENTREGUE: '#34d399',
  'PENDENTE DE ENTREGA': '#fbbf24',
  'PENDENTE DE PEDIDO': '#60a5fa',
  'PENDENTE DE ORCAMENTO': '#c084fc',
  PENDENTE: '#94a3b8',
};

const CHART_FONT = { family: "'DM Sans', system-ui", size: 12 };
let chartInstances = [];
let registrosRef = [];
let crudMesChartInstance = null;

// Retorna cores adaptadas ao tema atual
function themeColors() {
  const isLight = document.body.classList.contains('light-mode');
  return {
    legendColor:  isLight ? '#334155' : '#cbd5e1',
    titleColor:   isLight ? '#0f172a' : '#f8fafc',
    tickColor:    isLight ? '#64748b' : '#94a3b8',
    gridColor:    isLight ? 'rgba(100,116,139,0.12)' : 'rgba(148,163,184,0.08)',
    tooltipBg:    isLight ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.95)',
    tooltipTitle: isLight ? '#0f172a' : '#f1f5f9',
    tooltipBody:  isLight ? '#334155' : '#cbd5e1',
    borderColor:  isLight ? '#e2e8f0' : '#0f172a',
  };
}

function buildDefaults() {
  const tc = themeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: true },
    onHover: (e, el) => {
      e.native.target.style.cursor = el.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: {
        labels: { color: tc.legendColor, font: CHART_FONT, padding: 16, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: tc.tooltipBg,
        titleColor: tc.tooltipTitle,
        bodyColor: tc.tooltipBody,
        titleFont: { ...CHART_FONT, size: 13, weight: '600' },
        bodyFont: CHART_FONT,
        borderColor: 'rgba(212, 175, 55, 0.35)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx) => {
            let v = 0;
            if (typeof ctx.parsed === 'number') v = ctx.parsed;
            else if (ctx.chart?.options?.indexAxis === 'y') v = ctx.parsed.x;
            else v = ctx.parsed.y;
            return ` ${ctx.dataset.label}: ${fmtMoeda(v)}`;
          },
          footer: () => 'Clique para ver detalhes',
        },
      },
    },
  };
}

function gradient(ctx, c1, c2) {
  const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

function makeClickHandler(chartId) {
  return (_event, elements, chart) => {
    if (!elements?.length || !chart) return;
    const el = elements[0];
    const label = chart.data.labels[el.index];
    const datasetLabel = chart.data.datasets[el.datasetIndex]?.label;
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
  };
}

export function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

export function destroyCrudMesChart() {
  if (crudMesChartInstance) {
    crudMesChartInstance.destroy();
    crudMesChartInstance = null;
  }
}

export function renderCrudMesChart(registros, titulo = 'PREVISTOS X RECEBIDOS') {
  destroyCrudMesChart();
  registrosRef = registros;

  const ctx = document.getElementById('chartCrudMes');
  if (!ctx) return;

  const byMes = agregarRecebidosPrevistos(registros);
  const tc = themeColors();
  const premiumDefaults = buildDefaults();

  crudMesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: byMes.map((x) => x.mes),
      datasets: [
        {
          label: 'Valor Previsto',
          data: byMes.map((x) => x.previsto),
          backgroundColor: (c) => gradient(c, 'rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'),
          borderRadius: 6,
        },
        {
          label: 'Valor Recebido',
          data: byMes.map((x) => x.recebido),
          backgroundColor: (c) => gradient(c, 'rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'),
          borderRadius: 6,
        },
      ],
    },
    options: {
      ...premiumDefaults,
      onClick: makeClickHandler('mes'),
      plugins: {
        ...premiumDefaults.plugins,
        title: {
          display: true,
          text: titulo,
          color: tc.titleColor,
          font: { ...CHART_FONT, size: 14, weight: '600' },
        },
      },
      scales: {
        x: { ticks: { color: tc.tickColor, font: CHART_FONT }, grid: { display: false } },
        y: {
          ticks: { color: tc.tickColor, font: CHART_FONT, callback: (v) => fmtMoeda(v) },
          grid: { color: tc.gridColor },
        },
      },
    },
  });
}

export function renderDashboardCharts(registros) {
  destroyCharts();
  registrosRef = registros;

  const tc = themeColors();
  const premiumDefaults = buildDefaults();

  const byStatus = agregarPorStatus(registros);
  const byMes = agregarRecebidosPrevistos(registros);
  const byMaquina = agregarPorMaquina(registros)
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const ignoredStatuses = ['PENDENTE', 'PENDENTE DE ENVIO', 'PENDENTE DE RC', 'PENDENTE DE ORÇAMENTO', 'PENDENTE DE ORCAMENTO'];
  const byStatusFiltered = byStatus.filter(x => !ignoredStatuses.includes(x.status));

  const ctx1 = document.getElementById('chartStatus');
  if (ctx1) {
    const ch1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: byStatusFiltered.map((x) => x.status),
        datasets: [{
          label: 'Soma de VALOR',
          data: byStatusFiltered.map((x) => x.valor),
          backgroundColor: byStatusFiltered.map((x) => COLORS[x.status] || '#64748b'),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        ...premiumDefaults,
        onClick: makeClickHandler('status'),
        plugins: {
          ...premiumDefaults.plugins,
          legend: { display: false },
          title: {
            display: true,
            text: 'STATUS × CUSTO',
            color: tc.titleColor,
            font: { ...CHART_FONT, size: 14, weight: '600' },
          },
        },
        scales: {
          x: { ticks: { color: tc.tickColor, font: CHART_FONT }, grid: { color: tc.gridColor } },
          y: {
            ticks: { color: tc.tickColor, font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: tc.gridColor },
          },
        },
      },
    });
    chartInstances.push(ch1);
    ctx1.closest('.chart-box')?.classList.remove('skeleton');
  }

  const ctx2 = document.getElementById('chartMes');
  if (ctx2) {
    const ch2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: byMes.map((x) => x.mes),
        datasets: [
          {
            label: 'Valor Previsto',
            data: byMes.map((x) => x.previsto),
            backgroundColor: (c) => gradient(c, 'rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.4)'),
            borderRadius: 6,
          },
          {
            label: 'Valor Recebido',
            data: byMes.map((x) => x.recebido),
            backgroundColor: (c) => gradient(c, 'rgba(52, 211, 153, 0.9)', 'rgba(16, 185, 129, 0.35)'),
            borderRadius: 6,
          },
        ],
      },
      options: {
        ...premiumDefaults,
        onClick: makeClickHandler('mes'),
        plugins: {
          ...premiumDefaults.plugins,
          title: {
            display: true,
            text: 'RECEBIDOS E PREVISTOS',
            color: tc.titleColor,
            font: { ...CHART_FONT, size: 14, weight: '600' },
          },
        },
        scales: {
          x: { ticks: { color: tc.tickColor, font: CHART_FONT }, grid: { display: false } },
          y: {
            ticks: { color: tc.tickColor, font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: tc.gridColor },
          },
        },
      },
    });
    chartInstances.push(ch2);
    ctx2.closest('.chart-box')?.classList.remove('skeleton');
  }

  const ctx3 = document.getElementById('chartMaquina');
  if (ctx3) {
    const ch3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: byMaquina.map((x) => x.maquina_linha), // Nome completo na base para o drilldown
        datasets: [{
          label: 'Valor Recebido',
          data: byMaquina.map((x) => x.valor),
          backgroundColor: (c) => gradient(c, 'rgba(212, 175, 55, 0.85)', 'rgba(180, 140, 40, 0.35)'),
          borderRadius: 8,
          barThickness: Math.min(24, Math.max(12, 300 / (byMaquina.length || 1))),
          maxBarThickness: 32
        }],
      },
      options: {
        ...premiumDefaults,
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: makeClickHandler('maquina'),
        plugins: {
          ...premiumDefaults.plugins,
          title: {
            display: true,
            text: 'TOP 10 GASTOS POR MÁQUINA / LINHA',
            color: tc.titleColor,
            font: { ...CHART_FONT, size: 14, weight: '600' },
            padding: { top: 10, bottom: 20 }
          },
          legend: {
            display: false // Esconde a legenda, pois o eixo Y já tem os nomes
          },
          tooltip: {
            callbacks: {
              label: function(context) { return ' ' + fmtMoeda(context.raw); }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: tc.tickColor, font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: { 
            ticks: { 
              color: tc.tickColor, 
              font: CHART_FONT, 
              maxRotation: 0,
              callback: function(value, index, values) {
                // Trunca o texto do eixo Y para manter elegância
                const label = this.getLabelForValue(value);
                return label.length > 25 ? label.substring(0, 25) + '...' : label;
              }
            }, 
            grid: { display: false } 
          },
        }
      },
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

    const ch = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: natureza,
          data: data.map(d => d.qtde),
          backgroundColor: data.map(d => prazosColors[d.label]),
          borderWidth: 2,
          borderColor: tc.borderColor,
          hoverOffset: 4
        }]
      },
      options: {
        ...premiumDefaults,
        cutout: '60%',
        onClick: makeClickHandler('prazos'),
        plugins: {
          ...premiumDefaults.plugins,
          title: {
            display: true,
            text: title,
            color: tc.titleColor,
            font: { ...CHART_FONT, size: 14, weight: '600' }
          },
          tooltip: {
            ...premiumDefaults.plugins.tooltip,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} item(ns)`,
              footer: () => 'Clique para ver detalhes'
            }
          }
        }
      }
    });
    chartInstances.push(ch);
  }

  renderPrazoChart('chartConsertoDias', 'CONSERTO', 'CONSERTO');
  renderPrazoChart('chartComprasDias', 'COMPRAS', 'COMPRA');
}
