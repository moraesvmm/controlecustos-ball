/**
 * Lógica de negócio replicada das fórmulas Excel (Planilha1 / Tabela4)
 */

export const STATUS_LIST = [
  'ENTREGUE',
  'PENDENTE DE ENTREGA',
  'PENDENTE DE PEDIDO',
  'PENDENTE DE ORCAMENTO',
  'PENDENTE',
];

export const CRITICIDADE_LIST = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
export const NATUREZA_LIST = ['CONSERTO', 'FABRICACAO', 'COMPRA'];

export const NATUREZA_LABELS = {
  CONSERTO: 'Conserto',
  FABRICACAO: 'Fabricação',
  COMPRA: 'Compra',
  SERVICO: 'Serviço',
};

/** Normaliza valor da planilha / formulário para enum do banco */
export function normalizarNatureza(v) {
  const s = String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (s.includes('FABRIC')) return 'FABRICACAO';
  if (s.includes('COMPRA')) return 'COMPRA';
  if (s.includes('SERV')) return 'SERVICO';
  if (s.includes('CONSERT')) return 'CONSERTO';
  return 'CONSERTO';
}

/** Próximo ID sugerido para novo item (max + 1), como sequência da planilha */
export function proximoItemId(registros) {
  let max = 0;
  for (const r of registros) {
    const n = parseInt(String(r.item_id ?? ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

/** Mesmo ID pode ter várias linhas (RC/PO diferentes) — igual Excel */
export function registrosDoMesmoItem(registros, itemId) {
  if (itemId == null || itemId === '') return [];
  return registros.filter((r) => String(r.item_id) === String(itemId));
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10));
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Coluna T - STATUS */
export function calcularStatus(row) {
  if (hasValue(row.data_recebimento)) return 'ENTREGUE';
  if (hasValue(row.po)) return 'PENDENTE DE ENTREGA';
  if (hasValue(row.rc)) return 'PENDENTE DE PEDIDO';
  if (hasValue(row.orcamento)) return 'PENDENTE DE ORCAMENTO';
  return 'PENDENTE';
}

/** Coluna Q - ANO PREVISTO */
export function calcularAnoPrevisto(row) {
  const d = parseDate(row.previsao_entrega);
  return d ? d.getFullYear() : null;
}

/** Coluna U - VALOR PREVISTO (somente itens ainda não entregues) */
export function calcularValorPrevisto(row) {
  if (hasValue(row.data_recebimento)) return null;
  const d = parseDate(row.previsao_entrega);
  if (!d) return null;
  const now = new Date();
  if (
    d.getMonth() >= now.getMonth() &&
    d.getFullYear() >= now.getFullYear()
  ) {
    return Number(row.valor) || 0;
  }
  return null;
}

/** Coluna V - VALOR RECEBIDO */
export function calcularValorRecebido(row) {
  if (!hasValue(row.data_recebimento)) return null;
  return Number(row.valor) || 0;
}

/** Coluna W - MES REFERENCIA */
export function calcularMesReferencia(row) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const dr = parseDate(row.data_recebimento);
  const pe = parseDate(row.previsao_entrega);
  if (!dr && !pe) return null;
  const d = dr || pe;
  return meses[d.getMonth()];
}

/** Coluna X - MAQUINA_LINHA */
export function calcularMaquinaLinha(row) {
  const m = row.maquina || '';
  const l = row.linha || '';
  if (!m && !l) return '';
  return `${m} - ${l}`.replace(/^ - | - $/g, '').trim();
}

/** Coluna K (CONSERTO) - DIAS FORA */
export function calcularDiasFora(row) {
  const d = parseDate(row.data_saida);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

/** Enriquece registro com campos calculados */
export function enriquecerRegistro(row) {
  return {
    ...row,
    status: calcularStatus(row),
    ano_previsto: calcularAnoPrevisto(row),
    valor_previsto: calcularValorPrevisto(row),
    valor_recebido: calcularValorRecebido(row),
    mes_referencia: calcularMesReferencia(row),
    maquina_linha: calcularMaquinaLinha(row),
    dias_fora: calcularDiasFora(row),
  };
}

/** Agregações para dashboard (Planilha2 / pivôs) */
export function agregarPorStatus(registros) {
  const map = {};
  for (const r of registros) {
    const st = r.status || calcularStatus(r);
    map[st] = (map[st] || 0) + (Number(r.valor) || 0);
  }
  return Object.entries(map).map(([status, valor]) => ({ status, valor }));
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesChaveDeData(v) {
  const d = parseDate(v);
  return d ? MESES_CURTOS[d.getMonth()] : null;
}

export function agregarRecebidosPrevistos(registros) {
  const map = {};
  const bucket = (key) => {
    if (!map[key]) map[key] = { mes: key, previsto: 0, recebido: 0 };
    return map[key];
  };

  for (const r of registros) {
    const vr = r.valor_recebido ?? calcularValorRecebido(r);
    const vp = r.valor_previsto ?? calcularValorPrevisto(r);

    if (vr) {
      const key = mesChaveDeData(r.data_recebimento) || '—';
      bucket(key).recebido += Number(vr);
    }
    if (vp) {
      const key = mesChaveDeData(r.previsao_entrega) || '—';
      bucket(key).previsto += Number(vp);
    }
  }
  return Object.values(map);
}

export function agregarPorMaquina(registros) {
  const map = {};
  for (const r of registros) {
    const key = r.maquina_linha || calcularMaquinaLinha(r) || '—';
    const vr = r.valor_recebido ?? calcularValorRecebido(r);
    map[key] = (map[key] || 0) + (Number(vr) || 0);
  }
  return Object.entries(map)
    .map(([maquina_linha, valor]) => ({ maquina_linha, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 15);
}

export function totaisKPI(registros) {
  let totalValor = 0;
  let totalPrevisto = 0;
  let totalRecebido = 0;
  const porStatus = {};
  for (const r of registros) {
    totalValor += Number(r.valor) || 0;
    const vp = r.valor_previsto ?? calcularValorPrevisto(r);
    const vr = r.valor_recebido ?? calcularValorRecebido(r);
    if (vp) totalPrevisto += Number(vp);
    if (vr) totalRecebido += Number(vr);
    const st = r.status || calcularStatus(r);
    porStatus[st] = (porStatus[st] || 0) + 1;
  }
  return { totalValor, totalPrevisto, totalRecebido, porStatus, total: registros.length };
}

export function aplicarFiltros(registros, filtros) {
  return registros.filter((r) => {
    if (filtros.natureza && filtros.natureza !== 'TODOS' && r.natureza !== filtros.natureza) return false;
    if (filtros.status && filtros.status !== 'TODOS') {
      const st = r.status || calcularStatus(r);
      if (st !== filtros.status) return false;
    }
    if (filtros.criticidade && filtros.criticidade !== 'TODOS' && r.criticidade !== filtros.criticidade) return false;
    if (filtros.linha && filtros.linha !== 'TODOS' && r.linha !== filtros.linha) return false;
    if (filtros.maquina && filtros.maquina !== 'TODOS' && r.maquina !== filtros.maquina) return false;
    if (filtros.fornecedor && filtros.fornecedor !== 'TODOS' && r.fornecedor !== filtros.fornecedor) return false;
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      const blob = [r.item, r.descricao_falha, r.rc, r.po, r.solicitante, r.orcamento]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function opcoesUnicas(registros, campo) {
  return [...new Set(registros.map((r) => r[campo]).filter(Boolean))].sort();
}
