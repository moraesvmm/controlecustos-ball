import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_LOCAL_DATA } from './config.js?v=3';
import { enriquecerRegistro, normalizarNatureza } from './logic.js?v=9';

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
    criticidade: (row.CRITICIDADE || row.criticidade || '').toUpperCase().replace('CRÍTICA', 'CRITICA'),
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
    foto_url: row.foto_url || null,
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
    foto_url: registro.foto_url || null,
  };

  if (!USE_LOCAL_DATA) {
    const user = await getCurrentUser();
    if (user && user.user_metadata && user.user_metadata.username) {
      payload.last_modified_by = user.user_metadata.username;
      payload.last_modified_at = new Date().toISOString();
    }
  }

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

/* AUTENTICAÇÃO */
export async function signUp(email, password, username) {
  const client = getClient();
  if (!client) throw new Error('Supabase no carregado');
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { username } } });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const client = getClient();
  if (!client) throw new Error('Supabase no carregado');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = getClient();
  if (!client) throw new Error('Supabase no carregado');
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const client = getClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user;
}

export async function onAuthStateChange(callback) {
  const client = getClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  callback(session ? session.user : null);
  client.auth.onAuthStateChange((event, session) => {
    callback(session ? session.user : null);
  });
}

// ==========================================
// PREVENTIVA METHODS
// ==========================================

export async function carregarPreventiva() {
  const client = getClient();
  if (!client) throw new Error('Supabase não carregado');

  const { data, error } = await client.from('preventiva_registros').select('*').order('created_at');
  if (error) throw error;

  if (data) {
    data.forEach(r => {
      if (typeof r.atividades_descricoes === 'string') {
        try { r.atividades_descricoes = JSON.parse(r.atividades_descricoes); } catch (e) { r.atividades_descricoes = []; }
      }
      if (typeof r.material === 'string') {
        try { r.material = JSON.parse(r.material); } catch (e) { r.material = []; }
      }
      if (typeof r.programacao === 'string') {
        try { r.programacao = JSON.parse(r.programacao); } catch (e) { r.programacao = {}; }
      }
    });
  }

  return data || [];
}

export async function salvarPreventiva(registro) {
  const payload = {
    identificador: registro.identificador,
    maquina: registro.maquina,
    material: registro.material,
    plano_padrao: registro.plano_padrao,
    duracao_horas: registro.duracao_horas,
    hh_mec: registro.hh_mec,
    hh_eletrico: registro.hh_eletrico,
    resp_fabrica: registro.resp_fabrica,
    resp_manutencao: registro.resp_manutencao,
    status_auditoria: registro.status_auditoria,
    previsao_custos: registro.previsao_custos,
    atividades_descricoes: registro.atividades_descricoes || [],
    programacao: registro.programacao || {}
  };

  const user = await getCurrentUser();
  if (user && user.user_metadata && user.user_metadata.username) {
    payload.last_modified_by = user.user_metadata.username;
  }

  const client = getClient();
  delete payload.descricao;
  if (registro.id) {
    const { data, error } = await client.from('preventiva_registros').update(payload).eq('id', registro.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await client.from('preventiva_registros').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function excluirPreventiva(id) {
  const client = getClient();
  const { error } = await client.from('preventiva_registros').delete().eq('id', id);
  if (error) throw error;
}

// =============================
// MACHINE CRUD FUNCTIONS
// =============================

/** Get list of machines */
export async function getMachines() {
  const client = getClient();
  const { data, error } = await client.from('machines').select('*').order('nome');
  if (error) throw error;
  return data;
}

/** Create a new machine */
export async function createMachine(machine) {
  const client = getClient();
  const { data, error } = await client.from('machines').insert(machine).single();
  if (error) throw error;
  return data;
}

/** Update existing machine */
export async function updateMachine(id, updates) {
  const client = getClient();
  const { data, error } = await client.from('machines').update(updates).eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Delete a machine */
export async function deleteMachine(id) {
  const client = getClient();
  const { data, error } = await client.from('machines').delete().eq('id', id);
  if (error) throw error;
  return data;
}

// =============================
// MACHINE ACTIVITY FUNCTIONS
// =============================

/** Get activities for a machine */
export async function getMachineActivities(machineId) {
  const client = getClient();
  const { data, error } = await client.from('machine_activities').select('*').eq('machine_id', machineId).order('ordem');
  if (error) throw error;
  return data;
}

/** Create new activity for a machine */
export async function createMachineActivity(machineId, activity) {
  const client = getClient();
  const payload = { machine_id: machineId, ...activity };
  const { data, error } = await client.from('machine_activities').insert(payload).single();
  if (error) throw error;
  return data;
}

// =============================
// FORNECEDORES CONTATOS
// =============================

export async function getFornecedoresContatos() {
  const client = getClient();
  const { data, error } = await client.from('fornecedores_contatos').select('*');
  if (error) throw error;
  return data || [];
}

export async function upsertFornecedorContato(payload) {
  const client = getClient();
  // upsert requires the row to match the PK or unique constraint
  // We match on fornecedor_nome which is UNIQUE
  const { data, error } = await client.from('fornecedores_contatos').upsert({
    fornecedor_nome: payload.fornecedor_nome,
    email: payload.email,
    telefone: payload.telefone,
    mensagem_padrao: payload.mensagem_padrao
  }, { onConflict: 'fornecedor_nome' }).select().single();
  if (error) throw error;
  return data;
}

// =============================
// GESTÃO DE TAREFAS DELEGADAS
// =============================

export async function getTarefasDelegadas() {
  const client = getClient();
  const { data, error } = await client.from('tarefas_delegadas').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function criarTarefaDelegada(tarefa) {
  const client = getClient();
  const { data, error } = await client.from('tarefas_delegadas').insert(tarefa).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarStatusTarefa(id, status, typeTime) {
  const client = getClient();
  const payload = { status };
  if (typeTime === 'start') {
    payload.iniciado_em = new Date().toISOString();
  } else if (typeTime === 'finish') {
    payload.finalizado_em = new Date().toISOString();
  }
  const { data, error } = await client.from('tarefas_delegadas').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export function subscribeTarefas(callback) {
  const client = getClient();
  if (!client) return null;
  
  const channel = client.channel('custom-tarefas-channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tarefas_delegadas' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
    
  return channel;
}

// =============================
// MÓDULO DE CUSTO GERAL
// =============================

export async function getDadosCustoGeral() {
  const client = getClient();

  // 1. Função helper para paginação (Supabase limita a 1000 rows/request por padrão)
  async function fetchAll(table, orderCol) {
    let all = [];
    let from = 0;
    const limit = 1000;
    while (true) {
      let query = client.from(table).select('*').range(from, from + limit - 1);
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < limit) break;
      from += limit;
    }
    return all;
  }

  // 2. Carregar as 3 tabelas em paralelo com paginação
  const [dataCusto, dataDatasul, dataColab] = await Promise.all([
    fetchAll('custo_geral', 'dt_trans'),
    fetchAll('datasul_ordens'),
    fetchAll('colaboradores'),
  ]);

  // 3. Montar mapa Datasul: numero_ordem → solicitante (requisitante)
  const mapDatasul = {};
  for (const d of dataDatasul) {
    mapDatasul[d.numero_ordem] = d.solicitante;
  }

  // 4. Montar mapa Colaboradores: cod_req (lowercase) → { nome, area, cc, area_cc, turno }
  const mapColaboradores = {};
  for (const c of dataColab) {
    if (c.cod_req) {
      mapColaboradores[c.cod_req.toLowerCase()] = {
        nome: c.nome,
        area: c.area,
        cc: c.cc,
        area_cc: c.area_cc,
        turno: c.turno,
      };
    }
  }

  // 5. Enriquecer cada registro com as fórmulas/PROCVs
  const dadosEnriquecidos = dataCusto.map(row => {
    // PROCV 1: solicitante_2 = IF(Coluna1 != "", Coluna1, VLOOKUP(nr_ord_produ, datasul, "requisitante"))
    if (!row.solicitante || row.solicitante.trim() === '') {
      row.solicitante = mapDatasul[String(row.numero_ordem || '')] || null;
    }

    // Fórmula 2: item_tipo = LEFT(it_codigo, 3)
    row.item_tipo = (row.it_codigo || '').substring(0, 3).toUpperCase();

    // Fórmula 3: carater = IF(item_tipo == "SER", "Real Compras Serv", "Real Consumo")
    row.carater = row.item_tipo === 'SER' ? 'Real Compras Serv' : 'Real Consumo';

    // PROCVs 4, 5, 6: buscar colaborador pelo solicitante
    const solKey = (row.solicitante || '').trim().toLowerCase();
    const colab = mapColaboradores[solKey] || null;

    // PROCV 4: area = VLOOKUP(solicitante, COLABORADORES, "area")
    row.area = colab?.area || row.area || null;

    // PROCV 5: nome_solicitante = VLOOKUP(solicitante, COLABORADORES, "nome")
    row.nome_solicitante = colab?.nome || row.nome_solicitante || null;

    // PROCV 6: cc = VLOOKUP(solicitante, COLABORADORES, "area_cc")
    row.cc = colab?.area_cc || row.cc || null;

    // Fórmula 7: check = IF(area == "OUTROS", "OUTROS", area & " - " & carater)
    if (row.area) {
      row.check = row.area === 'OUTROS' ? 'OUTROS' : `${row.area} - ${row.carater}`;
    }

    // Fórmula 8: custo_cc = SUM(custo_do_mes, custo_mes_anterior, custo_de_entrada)
    row.custo_cc = (Number(row.custo_do_mes) || 0) + (Number(row.custo_mes_anterior) || 0) + (Number(row.custo_de_entrada) || 0);

    return row;
  });

  return dadosEnriquecidos;
}


export async function inserirCustoGeral(dados) {
  const client = getClient();
  const { data, error } = await client.from('custo_geral').insert([dados]).select();
  if (error) throw error;
  return data;
}

export async function atualizarCustoGeral(id, dados) {
  const client = getClient();
  const { data, error } = await client.from('custo_geral').update(dados).eq('id', id).select();
  if (error) throw error;
  return data;
}

export async function excluirCustoGeral(id) {
  const client = getClient();
  const { error } = await client.from('custo_geral').delete().eq('id', id);
  if (error) throw error;
}
