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

import { NATUREZA_LABELS } from './logic.js?v=9';

export function valorCelula(r, col) {
  const v = r[col.key];
  if (col.key === 'status') return badgeStatus(r.status);
  
  if (col.key === 'item_id') {
    let suffix = '';
    const nat = r.natureza ? r.natureza.toUpperCase() : '';
    if (nat === 'COMPRA') suffix = 'C';
    if (nat === 'FABRICACAO' || nat === 'FABRICAÇÃO') suffix = 'F';
    return `${v || ''}${suffix}`;
  }

  if (col.key === 'linha') {
    return v || '—';
  }

  if (col.key === 'sinal') {
    const st = r.status || 'PENDENTE';
    let color = 'transparent';
    if (st.includes('PEDIDO')) color = '#a855f7'; // Roxo
    else if (st.includes('ORÇAMENTO') || st.includes('ORCAMENTO')) color = '#f97316'; // Laranja
    else if (st.includes('ENTREGA')) color = '#3b82f6'; // Azul
    else if (st === 'ENTREGUE') color = 'var(--success)'; // Verde
    else if (st.includes('RC')) color = 'var(--warning)'; // Amarelo
    
    return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${color}; margin-right:0; flex-shrink:0;" title="${v || ''}"></span>`;
  }

  if (col.key === 'natureza') return NATUREZA_LABELS[r.natureza] || r.natureza || '—';
  if (col.key === 'criticidade') return badgeCriticidade(r.criticidade);
  if (col.fmt === 'moeda') return fmtMoeda(v);
  if (col.fmt === 'data') return fmtData(v);
  if (v == null || v === '') return '—';
  return String(v);
}

export function exportarExcel(registros, nome = 'controle-rc') {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX não carregada. Verifique sua conexão.');
    return;
  }

  const cols = COLUNAS_TABELA;
  const header = cols.map((c) => c.label);
  const data = registros.map((r) => {
    return cols.map((c) => {
      let v = r[c.key];
      if (c.key === 'status') v = r.status;
      if (v == null) return '';
      // Se for moeda, mantemos o número para o Excel entender como valor somável
      // Mas se o usuário quiser formatado, usamos texto. Vamos deixar numérico.
      return v;
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Aplicar larguras automáticas
  const colWidths = cols.map((c, i) => {
    let max = c.label.length;
    data.forEach((row) => {
      const val = row[i];
      if (val) {
        const len = String(val).length;
        if (len > max) max = len;
      }
    });
    return { wch: Math.min(max + 2, 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
