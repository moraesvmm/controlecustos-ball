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

const premiumDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'nearest', intersect: true },
  onHover: (e, el) => {
    e.native.target.style.cursor = el.length ? 'pointer' : 'default';
  },
  plugins: {
    legend: {
      labels: { color: '#cbd5e1', font: CHART_FONT, padding: 16, usePointStyle: true },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
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

export function renderDashboardCharts(registros) {
  destroyCharts();
  registrosRef = registros;

  const byStatus = agregarPorStatus(registros);
  const byMes = agregarRecebidosPrevistos(registros);
  const byMaquina = agregarPorMaquina(registros)
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const ctx1 = document.getElementById('chartStatus');
  if (ctx1) {
    const ch1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: byStatus.map((x) => x.status),
        datasets: [{
          label: 'Soma de VALOR',
          data: byStatus.map((x) => x.valor),
          backgroundColor: byStatus.map((x) => COLORS[x.status] || '#64748b'),
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
            color: '#f8fafc',
            font: { ...CHART_FONT, size: 14, weight: '600' },
          },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: CHART_FONT }, grid: { color: 'rgba(148,163,184,0.08)' } },
          y: {
            ticks: { color: '#94a3b8', font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: 'rgba(148,163,184,0.08)' },
          },
        },
      },
    });
    chartInstances.push(ch1);
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
            color: '#f8fafc',
            font: { ...CHART_FONT, size: 14, weight: '600' },
          },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: CHART_FONT }, grid: { display: false } },
          y: {
            ticks: { color: '#94a3b8', font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: 'rgba(148,163,184,0.08)' },
          },
        },
      },
    });
    chartInstances.push(ch2);
  }

  const ctx3 = document.getElementById('chartMaquina');
  if (ctx3) {
    const ch3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: byMaquina.map((x) => x.maquina_linha),
        datasets: [{
          label: 'Valor Recebido',
          data: byMaquina.map((x) => x.valor),
          backgroundColor: (c) => gradient(c, 'rgba(212, 175, 55, 0.85)', 'rgba(180, 140, 40, 0.35)'),
          borderRadius: 6,
          barThickness: Math.min(24, Math.max(12, 300 / (byMaquina.length || 1))),
          maxBarThickness: 32
        }],
      },
      options: {
        ...premiumDefaults,
        indexAxis: 'y',
        onClick: makeClickHandler('maquina'),
        plugins: {
          ...premiumDefaults.plugins,
          title: {
            display: true,
            text: 'GASTOS POR MÁQUINA',
            color: '#f8fafc',
            font: { ...CHART_FONT, size: 14, weight: '600' },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: CHART_FONT, callback: (v) => fmtMoeda(v) },
            grid: { color: 'rgba(148,163,184,0.08)' },
          },
          y: { ticks: { color: '#94a3b8', font: CHART_FONT, maxRotation: 0 }, grid: { display: false } },
        },
      },
    });
    chartInstances.push(ch3);
  }

  // --- Gráficos de Pizza (Prazos de Retorno) ---
  const prazosColors = {
    'Em dias': '#34d399', // Verde
    'Pendente de retorno': '#fbbf24', // Amarelo
    'Atrasado para retorno': '#f87171' // Vermelho
  };

  function renderPrazoChart(canvasId, title, natureza) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = agregarPrazosRetorno(registros, natureza);
    // Se não houver dados e quisermos mostrar vazio, não retornamos, renderizamos vazio
    
    const ch = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: natureza,
          data: data.map(d => d.qtde),
          backgroundColor: data.map(d => prazosColors[d.label]),
          borderWidth: 2,
          borderColor: '#0f172a',
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
            color: '#f8fafc',
            font: { ...CHART_FONT, size: 14, weight: '600' }
          },
          tooltip: {
            ...premiumDefaults.plugins.tooltip,
            callbacks: {
              label: (ctx) => {
                return ` ${ctx.label}: ${ctx.parsed} item(ns)`;
              },
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
  renderPrazoChart('chartFabricacaoDias', 'FABRICAÇÃO', 'FABRICACAO');
}
