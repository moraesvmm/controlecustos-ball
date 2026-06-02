/**
 * Lógica de negócio replicada das fórmulas Excel (Planilha1 / Tabela4)
 */

export const STATUS_LIST = [
  'ENTREGUE',
  'PENDENTE DE ENTREGA',
  'PENDENTE DE PEDIDO',
  'PENDENTE DE RC',
  'PENDENTE DE ORCAMENTO',
  'PENDENTE DE ENVIO',
  'PENDENTE',
];

export const CRITICIDADE_LIST = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
export const NATUREZA_LIST = ['CONSERTO', 'COMPRA'];

export const NATUREZA_LABELS = {
  CONSERTO: 'Conserto',
  COMPRA: 'Compra',
  SERVICO: 'Serviço',
};

/** Normaliza valor da planilha / formulário para enum do banco */
export function normalizarNatureza(v) {
  const s = String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (s.includes('COMPRA')) return 'COMPRA';
  if (s.includes('SERV')) return 'SERVICO';
  if (s.includes('CONSERT')) return 'CONSERTO';
  return 'CONSERTO';
}

/** Próximo ID sugerido para novo item (max + 1), como sequência da planilha */
export function proximoItemId(registros, natureza) {
  if (!registros || !registros.length) return 1;
  const filtrados = natureza 
    ? registros.filter(r => normalizarNatureza(r.natureza) === normalizarNatureza(natureza))
    : registros;
  if (!filtrados.length) return 1;
  return Math.max(...filtrados.map((r) => parseInt(r.item_id || 0, 10))) + 1;
}

/** Mesmo ID pode ter várias linhas (RC/PO diferentes) — igual Excel */
export function registrosDoMesmoItem(registros, itemId) {
  if (itemId == null || itemId === '') return [];
  return registros.filter((r) => String(r.item_id) === String(itemId));
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
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
  const NIVEIS = {
    'PENDENTE': 0,
    'PENDENTE DE ENVIO': 1,
    'PENDENTE DE ORCAMENTO': 2,
    'PENDENTE DE RC': 3,
    'PENDENTE DE PEDIDO': 4,
    'PENDENTE DE ENTREGA': 5,
    'ENTREGUE': 6
  };

  let autoStatus = 'PENDENTE';
  if (hasValue(row.data_recebimento)) autoStatus = 'ENTREGUE';
  else if (hasValue(row.po)) autoStatus = 'PENDENTE DE ENTREGA';
  else if (hasValue(row.rc)) autoStatus = 'PENDENTE DE PEDIDO';
  else if (hasValue(row.orcamento)) autoStatus = 'PENDENTE DE RC';
  else if (hasValue(row.data_saida)) autoStatus = 'PENDENTE DE ORCAMENTO';
  else if (hasValue(row.fornecedor)) autoStatus = 'PENDENTE DE ENVIO';

  const nivelAuto = NIVEIS[autoStatus] || 0;

  let importStatus = (row.sinal || '').trim().toUpperCase();
  if (importStatus.includes('ORÇAMENTO') || importStatus.includes('ORCAMENTO')) importStatus = 'PENDENTE DE ORCAMENTO';
  else if (importStatus === 'ENTREGE' || importStatus === 'ENTREGUE') importStatus = 'ENTREGUE';
  else if (importStatus.includes('PEDIDO')) importStatus = 'PENDENTE DE PEDIDO';
  else if (importStatus.includes('RC')) importStatus = 'PENDENTE DE RC';
  else if (importStatus.includes('ENVIO')) importStatus = 'PENDENTE DE ENVIO';
  else if (importStatus.includes('ENTREGA')) importStatus = 'PENDENTE DE ENTREGA';

  const nivelImport = NIVEIS[importStatus] || 0;

  return nivelImport > nivelAuto ? importStatus : autoStatus;
}

/** Coluna Q - ANO PREVISTO */
export function calcularAnoPrevisto(row) {
  const d = parseDate(row.previsao_entrega);
  return d ? d.getFullYear() : null;
}

/** Coluna U - VALOR PREVISTO (somente itens ainda não entregues) */
export function calcularValorPrevisto(row) {
  const status = row.status || calcularStatus(row);
  if (status === 'ENTREGUE') return null;
  const d = parseDate(row.previsao_entrega);
  if (!d) return null;
  return Number(row.valor) || 0;
}

/** Coluna V - VALOR RECEBIDO */
export function calcularValorRecebido(row) {
  const status = row.status || calcularStatus(row);
  if (status === 'ENTREGUE') {
    return Number(row.valor) || 0;
  }
  return null;
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
  const trimIfStr = (val) => (typeof val === 'string' ? val.trim() : val);
  const normLinha = (val) => {
    let s = trimIfStr(val);
    if (s && s.toUpperCase().startsWith('LINHAS ')) {
      s = s.replace(/^LINHAS /i, 'LINHA ');
    }
    return s;
  };
  return {
    ...row,
    natureza: trimIfStr(row.natureza),
    linha: normLinha(row.linha),
    maquina: trimIfStr(row.maquina),
    fornecedor: trimIfStr(row.fornecedor),
    criticidade: trimIfStr(row.criticidade),
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

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesChaveDeData(v) {
  const d = parseDate(v);
  return d ? MESES_CURTOS[d.getMonth()] : null;
}

/** Retorna o mês original de previsão de um item atrasado (ex: "Abr") ou null */
export function calcularMesOriginalAtraso(row) {
  const status = row.status || calcularStatus(row);
  if (status === 'ENTREGUE') return null; // já entregue
  const pe = parseDate(row.previsao_entrega);
  if (!pe) return null;
  const now = new Date();
  const nowMonth = now.getFullYear() * 12 + now.getMonth();
  const peMonth = pe.getFullYear() * 12 + pe.getMonth();
  if (peMonth < nowMonth) return MESES_CURTOS[pe.getMonth()];
  return null;
}

export function agregarRecebidosPrevistos(registros) {
  const map = {};
  const bucket = (key) => {
    if (!map[key]) map[key] = { mes: key, previsto: 0, recebido: 0 };
    return map[key];
  };

  const now = new Date();
  const mesAtualIdx = now.getMonth();
  const mesAtualKey = MESES_CURTOS[mesAtualIdx];
  const nowMonth = now.getFullYear() * 12 + now.getMonth();

  // Pré-preencher todos os meses retroativos até o mês atual (mesmo que fiquem zerados)
  for (let i = 0; i <= mesAtualIdx; i++) {
    bucket(MESES_CURTOS[i]);
  }

  for (const r of registros) {
    // --- Recebido: sempre soma no mês do recebimento ---
    const vr = r.valor_recebido ?? calcularValorRecebido(r);
    if (vr) {
      const key = mesChaveDeData(r.data_recebimento) || mesChaveDeData(r.previsao_entrega) || mesAtualKey;
      bucket(key).recebido += Number(vr);
    }

    // --- Previsto: lógica roll-forward ---
    const pe = parseDate(r.previsao_entrega);
    const status = r.status || calcularStatus(r);
    if (pe && status !== 'ENTREGUE') {
      const peMonth = pe.getFullYear() * 12 + pe.getMonth();
      const valor = Number(r.valor) || 0;
      if (valor > 0) {
        if (peMonth >= nowMonth) {
          // Mês atual ou futuro: previsto normal
          const key = MESES_CURTOS[pe.getMonth()];
          bucket(key).previsto += valor;
        } else {
          // Mês passado e NÃO recebido = atrasado → roll-forward para mês atual
          bucket(mesAtualKey).previsto += valor;
        }
      }
    }
  }

  // Ordenar cronologicamente (Jan → Dez), excluindo meses sem dados
  return MESES_CURTOS
    .filter((m) => map[m])
    .map((m) => map[m]);
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

export function agregarPrazosRetorno(registros, tipoNatureza) {
  // Inicializa contadores com zero para garantir que fatias existam mesmo sem itens
  const counts = {
    'Em dias': 0,
    'Pendente de retorno': 0,
    'Atrasado para retorno': 0
  };

  for (const r of registros) {
    if (r.natureza !== tipoNatureza) continue;
    if (r.data_recebimento) continue; // Já recebido, não entra nos prazos

    const diasFora = r.dias_fora ?? calcularDiasFora(r);
    if (diasFora == null || diasFora < 0) continue; // Sem data de saída ou data no futuro

    if (diasFora <= 35) {
      counts['Em dias']++;
    } else if (diasFora <= 75) {
      counts['Pendente de retorno']++;
    } else {
      counts['Atrasado para retorno']++;
    }
  }

  // Só retornamos chaves que tiverem > 0, ou podemos retornar tudo se quisermos que o gráfico fique em branco/placeholder.
  // Vamos retornar apenas as que têm valor para o pie chart.
  return Object.entries(counts)
    .filter(([_, qtde]) => qtde > 0)
    .map(([label, qtde]) => ({ label, qtde }));
}

export function agregarFornecedores(registros) {
  const map = {};
  for (const r of registros) {
    if (!r.fornecedor) continue;
    if (!map[r.fornecedor]) {
      map[r.fornecedor] = { totalEntregues: 0, noPrazo: 0, somaAtraso: 0, qtdAtraso: 0 };
    }
    
    // SLA conta apenas itens recebidos ou com previsão
    if (r.data_recebimento && r.previsao_entrega) {
      map[r.fornecedor].totalEntregues++;
      const dataRec = new Date(r.data_recebimento);
      const dataPrev = new Date(r.previsao_entrega);
      const diffTime = dataRec - dataPrev;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) {
        map[r.fornecedor].noPrazo++;
      } else {
        map[r.fornecedor].somaAtraso += diffDays;
        map[r.fornecedor].qtdAtraso++;
      }
    }
  }

  return Object.entries(map)
    .filter(([_, data]) => data.totalEntregues > 0)
    .map(([fornecedor, data]) => {
      const pontualidade = (data.noPrazo / data.totalEntregues) * 100;
      const mediaAtraso = data.qtdAtraso > 0 ? (data.somaAtraso / data.totalEntregues) : 0;
      let status = 'Excelente';
      if (pontualidade < 90) status = 'Bom';
      if (pontualidade < 75) status = 'Regular';
      if (pontualidade < 50) status = 'Ruim';

      return {
        fornecedor,
        entregues: data.totalEntregues,
        pontualidade,
        mediaAtraso,
        status
      };
    })
    .sort((a, b) => b.pontualidade - a.pontualidade);
}

export function opcoesUnicas(registros, campo) {
  return [...new Set(registros.map((r) => r[campo]).filter(Boolean))].sort();
}
