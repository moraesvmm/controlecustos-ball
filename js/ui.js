export function fmtMoeda(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtData(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return v;
}

export function badgeStatus(st) {
  const cls = 'badge badge-' + (st || 'PENDENTE').replace(/\s+/g, '-');
  return `<span class="${cls}">${st || '—'}</span>`;
}

export function badgeCriticidade(c) {
  if (!c) return '—';
  return `<span class="badge badge-${c}">${c}</span>`;
}

export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show toast-${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

export function confirmar(msg) {
  return window.confirm(msg);
}

export const COLUNAS_TABELA = [
  { key: 'item_id', label: 'ID', width: 56 },
  { key: 'sinal', label: 'Sinal', width: 70 },
  { key: 'natureza', label: 'Natureza', width: 90 },
  { key: 'item', label: 'Item', width: 200 },
  { key: 'descricao_falha', label: 'Descrição falha', width: 220 },
  { key: 'solicitante', label: 'Solicitante', width: 130 },
  { key: 'criticidade', label: 'Criticidade', width: 90 },
  { key: 'linha', label: 'Linha', width: 100 },
  { key: 'maquina', label: 'Máquina', width: 120 },
  { key: 'fornecedor', label: 'Fornecedor', width: 110 },
  { key: 'nf_saida', label: 'NF saída', width: 90 },
  { key: 'data_saida', label: 'Data saída', width: 100, fmt: 'data' },
  { key: 'orcamento', label: 'Orçamento', width: 110 },
  { key: 'rc', label: 'RC', width: 90 },
  { key: 'po', label: 'PO', width: 90 },
  { key: 'valor', label: 'Valor', width: 100, fmt: 'moeda' },
  { key: 'previsao_entrega', label: 'Previsão', width: 100, fmt: 'data' },
  { key: 'data_recebimento', label: 'Recebimento', width: 110, fmt: 'data' },
  { key: 'status', label: 'Status', width: 150, computed: true },
  { key: 'valor_previsto', label: 'V. Previsto', width: 100, fmt: 'moeda', computed: true },
  { key: 'valor_recebido', label: 'V. Recebido', width: 100, fmt: 'moeda', computed: true },
  { key: 'mes_referencia', label: 'Mês ref.', width: 80, computed: true },
  { key: 'maquina_linha', label: 'Máq./Linha', width: 160, computed: true },
  { key: 'dias_fora', label: 'Dias fora', width: 80, computed: true },
];

import { NATUREZA_LABELS } from './logic.js';

export function valorCelula(r, col) {
  const v = r[col.key];
  if (col.key === 'status') return badgeStatus(r.status);
  if (col.key === 'natureza') return NATUREZA_LABELS[r.natureza] || r.natureza || '—';
  if (col.key === 'criticidade') return badgeCriticidade(r.criticidade);
  if (col.fmt === 'moeda') return fmtMoeda(v);
  if (col.fmt === 'data') return fmtData(v);
  if (v == null || v === '') return '—';
  return String(v);
}

export function exportarCSV(registros, nome = 'controle-rc') {
  const cols = COLUNAS_TABELA;
  const header = cols.map((c) => c.label).join(';');
  const lines = registros.map((r) =>
    cols
      .map((c) => {
        let v = r[c.key];
        if (c.key === 'status') v = r.status;
        if (v == null) return '';
        return `"${String(v).replace(/"/g, '""')}"`;
      })
      .join(';')
  );
  const blob = new Blob(['\ufeff' + header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
