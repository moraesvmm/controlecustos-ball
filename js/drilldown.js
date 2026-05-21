import { fmtMoeda, fmtData, badgeStatus, badgeCriticidade } from './ui.js';
import { calcularStatus, calcularDiasFora, calcularValorPrevisto, calcularValorRecebido } from './logic.js';

let onEditCallback = null;

export function setDrilldownEditHandler(fn) {
  onEditCallback = fn;
}

export function abrirDrilldown({ titulo, subtitulo, registros, meta = {} }) {
  const panel = document.getElementById('drillPanel');
  const overlay = document.getElementById('drillOverlay');
  if (!panel) return;

  const total = registros.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const totalPrev = registros.reduce((s, r) => s + (Number(r.valor_previsto) || 0), 0);
  const totalRec = registros.reduce((s, r) => s + (Number(r.valor_recebido) || 0), 0);
  const atrasados = registros.filter((r) => {
    const st = r.status || calcularStatus(r);
    if (st === 'ENTREGUE') return false;
    const pe = r.previsao_entrega;
    if (!pe) return false;
    return new Date(pe) < new Date();
  }).length;

  document.getElementById('drillTitulo').textContent = titulo;
  document.getElementById('drillSubtitulo').textContent = subtitulo || '';

  const stats = [
    { label: 'Registros', value: registros.length },
    { label: 'Valor total', value: fmtMoeda(total) },
    { label: 'Previsto', value: fmtMoeda(totalPrev) },
    { label: 'Recebido', value: fmtMoeda(totalRec) },
    { label: 'Atrasados', value: atrasados, warn: atrasados > 0 },
  ];

  document.getElementById('drillStats').innerHTML = stats
    .map(
      (s) => `
    <div class="drill-stat ${s.warn ? 'warn' : ''}">
      <span>${s.label}</span>
      <strong>${s.value}</strong>
    </div>`
    )
    .join('');

  if (meta.insight) {
    document.getElementById('drillInsight').innerHTML = `<p>${meta.insight}</p>`;
    document.getElementById('drillInsight').style.display = 'block';
  } else {
    document.getElementById('drillInsight').style.display = 'none';
  }

  const lista = document.getElementById('drillLista');
  if (!registros.length) {
    lista.innerHTML = '<p class="empty">Nenhum registro neste recorte.</p>';
  } else {
    lista.innerHTML = registros
      .slice(0, 50)
      .map(
        (r) => `
      <article class="drill-item" data-id="${r.id}">
        <div class="drill-item-head">
          <strong>${r.item || '—'}</strong>
          ${badgeStatus(r.status || calcularStatus(r))}
        </div>
        <div class="drill-item-meta">
          <span>${r.maquina_linha || `${r.maquina || ''} · ${r.linha || ''}`}</span>
          <span>${fmtMoeda(r.valor)}</span>
        </div>
        <div class="drill-item-detail">
          RC ${r.rc || '—'} · PO ${r.po || '—'} · ${r.fornecedor || '—'}
          ${r.previsao_entrega ? ` · Prev. ${fmtData(r.previsao_entrega)}` : ''}
          ${r.dias_fora != null ? ` · ${r.dias_fora}d fora` : calcularDiasFora(r) != null ? ` · ${calcularDiasFora(r)}d fora` : ''}
        </div>
        <div class="drill-item-actions">
          <button type="button" class="btn-ghost btn-drill-edit" data-id="${r.id}">Editar</button>
          <button type="button" class="btn-ghost btn-drill-rc" data-id="${r.id}">Ver RC</button>
        </div>
      </article>`
      )
      .join('');

    if (registros.length > 50) {
      lista.innerHTML += `<p class="drill-more">+ ${registros.length - 50} registros. Refine o filtro ou exporte CSV.</p>`;
    }

    lista.querySelectorAll('.btn-drill-edit, .btn-drill-rc').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onEditCallback) onEditCallback(btn.dataset.id);
        fecharDrilldown();
      });
    });
  }

  overlay?.classList.add('open');
  panel.classList.add('open');
}

export function fecharDrilldown() {
  document.getElementById('drillPanel')?.classList.remove('open');
  document.getElementById('drillOverlay')?.classList.remove('open');
}

/** Filtra registros conforme clique no gráfico */
export function registrosPorClique(chartId, label, datasetLabel, registros) {
  if (chartId === 'status') {
    return registros.filter((r) => (r.status || '') === label);
  }
  if (chartId === 'mes-dataset') {
    const mes = String(label).toLowerCase();
    if (datasetLabel === 'Valor Previsto') {
      return registros.filter((r) => {
        if (calcularValorPrevisto(r) == null) return false;
        const pe = r.previsao_entrega;
        if (!pe) return false;
        const d = new Date(String(pe).slice(0, 10));
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        return meses[d.getMonth()] === mes.slice(0, 3);
      });
    }
    if (datasetLabel === 'Valor Recebido') {
      return registros.filter((r) => {
        if (calcularValorRecebido(r) == null) return false;
        const d = new Date(String(r.data_recebimento).slice(0, 10));
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        return meses[d.getMonth()] === mes.slice(0, 3);
      });
    }
  }
  if (chartId === 'maquina') {
    return registros.filter((r) => (r.maquina_linha || '') === label);
  }
  if (chartId === 'mes-dataset') {
    const mes = label;
    if (datasetLabel === 'Valor Previsto') {
      return registros.filter((r) => r.valor_previsto && (r.mes_referencia === mes || String(r.ano_previsto) === mes));
    }
    if (datasetLabel === 'Valor Recebido') {
      return registros.filter((r) => r.valor_recebido && r.data_recebimento);
    }
  }
  return registros;
}
