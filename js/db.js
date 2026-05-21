import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_LOCAL_DATA } from './config.js';
import { enriquecerRegistro, normalizarNatureza } from './logic.js';

let supabaseClient = null;

export function getClient() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function mapFromExcel(row) {
  const parseDateField = (v) => {
    if (!v) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  };

  return enriquecerRegistro({
    id: row.id,
    sinal: row.SINAL ?? row.sinal,
    item_id: row.ID ?? row.item_id,
    natureza: normalizarNatureza(row.NATUREZA || row.natureza),
    item: row.ITEM || row.item || '',
    descricao_falha: row['DESCRIÇÃO FALHA'] || row.descricao_falha,
    solicitante: row.SOLICITANTE || row.solicitante,
    criticidade: (row.CRITICIDADE || row.criticidade || '').toUpperCase().replace('CRITICA', 'CRITICA'),
    linha: row.LINHA || row.linha,
    maquina: row.MAQUINA || row.maquina,
    fornecedor: row.FORNECEDOR || row.fornecedor,
    nf_saida: row['NF DE SAÍDA'] != null ? String(row['NF DE SAÍDA']) : row.nf_saida,
    data_saida: parseDateField(row['DATA DE SAÍDA'] || row.data_saida),
    orcamento: row.ORÇAMENTO != null ? String(row.ORÇAMENTO) : row.orcamento,
    rc: row.RC != null ? String(row.RC) : row.rc,
    po: row.PO != null ? String(row.PO) : row.po,
    valor: Number(row.VALOR ?? row.valor) || 0,
    previsao_entrega: parseDateField(row.PREVISAO_ENTREGA || row.previsao_entrega),
    data_recebimento: parseDateField(row['DATA RECEBIMENTO'] || row.data_recebimento),
    comentario: row.comentario,
  });
}

let cacheLocal = null;

export async function carregarRegistros() {
  if (USE_LOCAL_DATA) {
    if (!cacheLocal) {
      const res = await fetch('./data/rc_principal.json');
      const raw = await res.json();
      cacheLocal = raw.map(mapFromExcel);
    }
    return [...cacheLocal];
  }

  const client = getClient();
  if (!client) throw new Error('Supabase não carregado');

  const { data, error } = await client.from('rc_registros').select('*').order('item_id');
  if (error) throw error;
  return (data || []).map(enriquecerRegistro);
}

export async function salvarRegistro(registro) {
  const payload = {
    sinal: registro.sinal,
    item_id: registro.item_id,
    natureza: normalizarNatureza(registro.natureza),
    item: registro.item,
    descricao_falha: registro.descricao_falha,
    solicitante: registro.solicitante,
    criticidade: registro.criticidade,
    linha: registro.linha,
    maquina: registro.maquina,
    fornecedor: registro.fornecedor,
    nf_saida: registro.nf_saida,
    data_saida: registro.data_saida,
    orcamento: registro.orcamento,
    rc: registro.rc,
    po: registro.po,
    valor: registro.valor,
    previsao_entrega: registro.previsao_entrega,
    data_recebimento: registro.data_recebimento,
    comentario: registro.comentario,
  };

  if (USE_LOCAL_DATA) {
    if (registro.id) {
      const i = cacheLocal.findIndex((r) => r.id === registro.id);
      if (i >= 0) cacheLocal[i] = enriquecerRegistro({ ...registro, ...payload });
    } else {
      registro.id = crypto.randomUUID();
      cacheLocal.push(enriquecerRegistro({ ...registro, ...payload }));
    }
    return enriquecerRegistro(registro);
  }

  const client = getClient();
  if (registro.id) {
    const { data, error } = await client.from('rc_registros').update(payload).eq('id', registro.id).select().single();
    if (error) throw error;
    return enriquecerRegistro(data);
  }
  const { data, error } = await client.from('rc_registros').insert(payload).select().single();
  if (error) throw error;
  return enriquecerRegistro(data);
}

export async function excluirRegistro(id) {
  if (USE_LOCAL_DATA) {
    cacheLocal = cacheLocal.filter((r) => r.id !== id);
    return;
  }
  const client = getClient();
  const { error } = await client.from('rc_registros').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicarRegistro(id) {
  const lista = await carregarRegistros();
  const orig = lista.find((r) => r.id === id);
  if (!orig) throw new Error('Registro não encontrado');
  const { id: _id, created_at, updated_at, ...rest } = orig;
  const copia = {
    ...rest,
    item_id: orig.item_id,
    item: `${orig.item} (cópia)`.slice(0, 200),
    rc: null,
    po: null,
    data_recebimento: null,
  };
  return salvarRegistro(copia);
}
