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

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve();
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
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
  { key: 'valor', label: 'Valor (Reparo)', width: 110, fmt: 'moeda' },
  { key: 'valoracao', label: 'Valoração (Item)', width: 120, fmt: 'moeda' },
  { key: 'previsao_entrega', label: 'Previsão', width: 100, fmt: 'data' },
  { key: 'data_recebimento', label: 'Recebimento', width: 110, fmt: 'data' },
  { key: 'nota_retorno', label: 'Nota Retorno', width: 120 },
  { key: 'status', label: 'Status', width: 150, computed: true },
  { key: 'valor_previsto', label: 'V. Previsto', width: 100, fmt: 'moeda', computed: true },
  { key: 'valor_recebido', label: 'V. Recebido', width: 100, fmt: 'moeda', computed: true },
  { key: 'mes_referencia', label: 'Mês ref.', width: 80, computed: true },
  { key: 'maquina_linha', label: 'Máq./Linha', width: 160, computed: true },
  { key: 'dias_fora', label: 'Dias fora', width: 80, computed: true },
];

export const COLUNAS_CUSTO_GERAL = [
  { key: 'numero_ordem', label: 'Ordem', width: 100 },
  { key: 'it_codigo', label: 'Item', width: 120 },
  { key: 'descricao_codigo', label: 'Descrição', width: 250 },
  { key: 'dt_trans', label: 'Data', width: 100, fmt: 'data' },
  { key: 'mes', label: 'Mês', width: 60 },
  { key: 'ent_sai', label: 'Movimento', width: 100 },
  { key: 'quantidade', label: 'Qtd', width: 80 },
  { key: 'nro_docto', label: 'Nro. Documento', width: 120 },
  { key: 'linha', label: 'Linha', width: 120 },
  { key: 'solicitante', label: 'Cód. Solicitante', width: 120 },
  { key: 'nome_solicitante', label: 'Nome Solicitante', width: 150 },
  { key: 'area', label: 'Área', width: 120 },
  { key: 'cc', label: 'C.C.', width: 100 },
  { key: 'item_tipo', label: 'Tipo Item', width: 80 },
  { key: 'carater', label: 'Caráter', width: 140 },
  { key: 'material', label: 'Material', width: 100, fmt: 'moeda' },
  { key: 'ggf', label: 'GGF', width: 100, fmt: 'moeda' },
  { key: 'custo_do_mes', label: 'Custo Mês', width: 120, fmt: 'moeda' },
  { key: 'custo_mes_anterior', label: 'Custo Anterior', width: 120, fmt: 'moeda' },
  { key: 'custo_de_entrada', label: 'Custo Entrada', width: 120, fmt: 'moeda' },
  { key: 'custo_cc', label: 'Custo CC', width: 120, fmt: 'moeda' },
];

import { NATUREZA_LABELS } from './logic.js?v=9';

export function valorCelula(r, col) {
  const v = r[col.key];
  if (col.key === 'status') return badgeStatus(r.status);
  
  if (col.key === 'item_id') {
    let suffix = '';
    const nat = String(r.natureza || '').toUpperCase();
    if (nat === 'COMPRA') suffix = 'C';
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

export async function exportarExcel(registros, nome = 'controle-rc', customCols = null) {
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js');
  } catch (e) {
    alert('Erro ao carregar biblioteca ExcelJS. Verifique sua conexão.');
    return;
  }
  if (typeof ExcelJS === 'undefined') {
    alert('Biblioteca ExcelJS não carregada.');
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dados');

  const cols = customCols || COLUNAS_TABELA;

  // 1. Cabeçalho formatado
  const headerRow = ws.addRow(cols.map(c => c.label));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' } // Cor do tema escuro corporativo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // 2. Inserção de dados
  registros.forEach(r => {
    const rowData = cols.map(c => {
      let v = r[c.key];
      if (c.key === 'status') v = r.status || v;
      if (v == null) return '';
      return v;
    });
    const row = ws.addRow(rowData);
    
    // 3. Formatação das células (moeda, datas)
    row.eachCell((cell, colNumber) => {
      const col = cols[colNumber - 1];
      cell.alignment = { vertical: 'middle', wrapText: true };
      
      if (col.isCurrency && typeof cell.value === 'number') {
        cell.numFmt = '"R$" #,##0.00';
      }
      
      if (col.isDate && cell.value) {
        // Converte string 'YYYY-MM-DD' para objeto Date para que o Excel entenda nativamente
        if (typeof cell.value === 'string' && cell.value.includes('-')) {
          const parts = cell.value.split('-');
          if (parts.length === 3) {
            cell.value = new Date(parts[0], parts[1] - 1, parts[2]);
            cell.numFmt = 'dd/mm/yyyy';
            cell.alignment = { horizontal: 'center' };
          }
        }
      }
      
      // Centraliza a coluna Status e outras chaves comuns
      if (col.key === 'status' || col.key === 'criticidade') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  });

  // 4. Auto-ajuste de colunas
  ws.columns.forEach((column, i) => {
    let max = cols[i].label.length;
    column.eachCell({ includeEmpty: true }, (cell) => {
      let len = cell.value ? cell.value.toString().length : 0;
      if (cell.type === ExcelJS.ValueType.Date) len = 10;
      if (cols[i].isCurrency) len = 12; // espaço para R$
      if (len > max) max = len;
    });
    column.width = Math.min(max + 3, 40);
  });

  // 5. Adicionar botões de AutoFiltro
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length }
  };

  // 6. Gerar e baixar arquivo
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
