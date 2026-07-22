import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_LOCAL_DATA } from './config.js?v=3';
import { enriquecerRegistro, normalizarNatureza } from './logic.js?v=10';
import { EXCEL_COLAB_MAP, EXCEL_ORDEM_MAP } from './excel_mapping.js?v=1';

let supabaseClient = null;

export function getClient() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        timeout: 1 // mock
      },
      auth: { persistSession: false }
    });
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
    nota_retorno: row['NOTA RETORNO'] != null ? String(row['NOTA RETORNO']) : (row.nota_retorno || null),
    comentario: row.comentario,
    foto_url: row.foto_url || null,
  });
}

let cacheLocal = null;

// ==========================================
// FUNÇÕES GLOBAIS DE CACHE OFFLINE-FIRST
// ==========================================
export async function fetchWithCache(tableName, cacheKey, mapFn, orderBy = 'id', ascending = true, hasUpdatedAt = false) {
  const client = getClient();
  if (!client) throw new Error('Supabase não carregado');

  const cache = localStorage.getItem(cacheKey);
  const lastSyncStr = localStorage.getItem(`${cacheKey}_last_sync`);
  let localData = cache ? JSON.parse(cache) : [];

  const syncColumn = typeof hasUpdatedAt === 'string' ? hasUpdatedAt : (hasUpdatedAt ? 'updated_at' : null);

  // Se tem syncColumn e já temos cache, faz sync diferencial (Egress quase zero)
  if (syncColumn && localData.length > 0 && lastSyncStr) {
    try {
      console.log(`%c[Cache Inteligente - ${tableName}] Sincronização diferencial ativada! Buscando apenas os IDs atuais e os registros alterados desde a última sessão.`, 'color: #00ff00; font-weight: bold; font-size: 14px;');
      // 1. Busca IDs atuais para remover deletados
      const { data: currentIds, error: errorIds } = await client.from(tableName).select('id');
      if (errorIds) throw errorIds;
      const validIds = new Set(currentIds.map(x => String(x.id)));
      localData = localData.filter(x => validIds.has(String(x.id)));

      // 2. Busca apenas o que foi alterado/criado desde a última sincronização
      const { data: updated, error: errorUpd } = await client.from(tableName)
        .select('*')
        .gt(syncColumn, lastSyncStr)
        .order(orderBy, { ascending });
      if (errorUpd) throw errorUpd;

      if (updated && updated.length > 0) {
        const mapUpd = new Map(updated.map(x => [String(x.id), x]));
        localData = localData.map(x => mapUpd.has(String(x.id)) ? mapUpd.get(String(x.id)) : x);
        const existingIds = new Set(localData.map(x => String(x.id)));
        for (const u of updated) {
          if (!existingIds.has(String(u.id))) localData.push(u);
        }
      }
      
      // Garantir que localData não tenha IDs duplicados (limpeza de estado local corrompido)
      const deduplicated = [];
      const seen = new Set();
      for (const item of localData) {
        if (!seen.has(String(item.id))) {
          seen.add(String(item.id));
          deduplicated.push(item);
        }
      }
      localData = deduplicated;

      try {
        localStorage.setItem(cacheKey, JSON.stringify(localData));
        const safeSync = new Date();
        safeSync.setMinutes(safeSync.getMinutes() - 10);
        localStorage.setItem(`${cacheKey}_last_sync`, safeSync.toISOString());
      } catch (quotaErr) {
        console.warn('Cota do LocalStorage excedida. Limpando chaves antigas...');
        for (let key in localStorage) {
          if (key.startsWith('cache_')) localStorage.removeItem(key);
        }
        localStorage.setItem(cacheKey, JSON.stringify(localData));
        const safeSync = new Date();
        safeSync.setMinutes(safeSync.getMinutes() - 10);
        localStorage.setItem(`${cacheKey}_last_sync`, safeSync.toISOString());
      }
      
      localData.sort((a, b) => {
        let valA = a[orderBy], valB = b[orderBy];
        if(typeof valA === 'string') return ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return ascending ? valA - valB : valB - valA;
      });

      return localData.map(mapFn);
    } catch (err) {
      console.error('Erro no sync parcial, recarregando tabela inteira...', err);
    }
  }

  // Fallback: Busca total na nuvem (primeira vez ou tabelas sem updated_at)
  const { data, error } = await client.from(tableName).select('*').order(orderBy, { ascending });
  if (error) throw error;
  
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data || []));
    const safeSyncFallback = new Date();
    safeSyncFallback.setMinutes(safeSyncFallback.getMinutes() - 10);
    localStorage.setItem(`${cacheKey}_last_sync`, safeSyncFallback.toISOString());
  } catch (quotaErr) {
    console.warn('Cota do LocalStorage excedida (Fallback). Limpando chaves antigas...');
    for (let key in localStorage) {
      if (key.startsWith('cache_')) localStorage.removeItem(key);
    }
    localStorage.setItem(cacheKey, JSON.stringify(data || []));
    const safeSyncFallback = new Date();
    safeSyncFallback.setMinutes(safeSyncFallback.getMinutes() - 10);
    localStorage.setItem(`${cacheKey}_last_sync`, safeSyncFallback.toISOString());
  }
  return (data || []).map(mapFn);
}

export function invalidateCache(cacheKey) {
  localStorage.removeItem(cacheKey);
  localStorage.removeItem(`${cacheKey}_last_sync`);
}

export async function carregarRegistros() {
  if (USE_LOCAL_DATA) {
    if (!cacheLocal) {
      const res = await fetch('./data/rc_principal.json');
      const raw = await res.json();
      cacheLocal = raw.map(mapFromExcel);
    }
    return [...cacheLocal];
  }

  // Limpeza de chaves antigas para liberar cota do localStorage (Evita QuotaExceededError)
  localStorage.removeItem('cache_rc_registros');
  localStorage.removeItem('cache_rc_registros_last_sync');

  // Usa o sistema inteligente de cache com Egress mínimo
  return fetchWithCache('rc_registros', 'cache_rc_v2', enriquecerRegistro, 'item_id', true, 'last_modified_at');
}

export async function salvarRegistro(registro) {
  let combinedMedia = null;
  if (registro.foto_url && registro.pdf_url) {
    combinedMedia = registro.foto_url + "|||PDF|||" + registro.pdf_url;
  } else if (registro.foto_url) {
    combinedMedia = registro.foto_url;
  } else if (registro.pdf_url) {
    combinedMedia = "|||PDF|||" + registro.pdf_url;
  }

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
    nota_retorno: registro.nota_retorno || null,
    comentario: registro.comentario,
    foto_url: combinedMedia,
  };

  if (!USE_LOCAL_DATA) {
    payload.last_modified_at = new Date().toISOString();
    const user = await getCurrentUser();
    if (user && user.user_metadata && user.user_metadata.username) {
      payload.last_modified_by = user.user_metadata.username;
    } else {
      payload.last_modified_by = 'Sistema';
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
  if (registro.id && !registro._isNew) {
    const { data, error } = await client.from('rc_registros').update(payload).eq('id', registro.id).select().single();
    if (error) throw error;
    return enriquecerRegistro(data);
  }
  
  if (registro._isNew && registro.id) {
    payload.id = registro.id;
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
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password, data: { username } })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar conta");
  }
  return await res.json();
}

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token`, {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error("Credenciais inválidas");
  const data = await res.json();
  localStorage.setItem("local_user", JSON.stringify(data.user));
  // Dispara evento para onAuthStateChange reagir na mesma aba
  window.dispatchEvent(new CustomEvent('localAuthChange', { detail: data.user }));
  return data;
}

export async function signOut() {
  localStorage.removeItem("local_user");
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST" }).catch(() => {});
  // Dispara evento para onAuthStateChange reagir na mesma aba
  window.dispatchEvent(new CustomEvent('localAuthChange', { detail: null }));
}

export async function getCurrentUser() {
  const u = localStorage.getItem("local_user");
  return u ? JSON.parse(u) : null;
}

export async function onAuthStateChange(callback) {
  const u = localStorage.getItem("local_user");
  callback(u ? JSON.parse(u) : null);
  // Ouve logins/logouts na mesma aba
  window.addEventListener('localAuthChange', (e) => {
    callback(e.detail || null);
  });
  // Ouve mudanças de outras abas
  window.addEventListener("storage", (e) => {
    if (e.key === "local_user") {
      const curr = e.newValue ? JSON.parse(e.newValue) : null;
      callback(curr);
    }
  });
}

// ==========================================
// PREVENTIVA METHODS
// ==========================================

export async function carregarPreventiva() {
  const data = await fetchWithCache('preventiva_registros', 'cache_preventiva', x => x, 'created_at', true, false);

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
  const payload = { ...registro };
  delete payload.id;
  delete payload.descricao;
  
  if (!payload.atividades_descricoes) payload.atividades_descricoes = [];
  if (!payload.programacao) payload.programacao = {};

  const user = await getCurrentUser();
  if (user && user.user_metadata && user.user_metadata.username) {
    payload.last_modified_by = user.user_metadata.username;
  }

  const client = getClient();
  if (registro.id) {
    const { data, error } = await client.from('preventiva_registros').update(payload).eq('id', registro.id).select().single();
    if (error) throw new Error(error.message || JSON.stringify(error));
    return data;
  }
  const { data, error } = await client.from('preventiva_registros').insert(payload).select().single();
  if (error) throw new Error(error.message || JSON.stringify(error));
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
  return fetchWithCache('machines', 'cache_machines', x => x, 'nome', true, false);
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
  return fetchWithCache('fornecedores_contatos', 'cache_fornecedores', x => x, 'fornecedor_nome', true, false);
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
  return fetchWithCache('tarefas_delegadas', 'cache_tarefas', x => x, 'criado_em', false, false);
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

// ==============================================================================
// MÓDULO REAL-TIME / SINCRONIZAÇÃO DISTRIBUÍDA (SSE)
// ==============================================================================
// Responsabilidade: Manter o frontend (navegador) 100% atualizado com o banco
// de dados sem precisar de F5, simulando o efeito de WebSocket do Supabase.
// Funciona escutando a rota /api/stream do backend Python.
// ==============================================================================
export function initRealtimeSync(callback) {
  // Option 2: Backend Polling + SSE (Server-Sent Events)
  // O backend Python monitora a data de modificação do banco de dados (mtime).
  // Se mudar, ele emite um evento SSE. O frontend recebe aqui e executa o callback de refresh.
  try {
    // A porta 8080 pode variar, mas normalmente usamos endpoints relativos
    // Usa rota relativa para garantir que funciona independente do IP/Porta onde o sistema roda
    const evtSource = new EventSource("/api/stream");
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'db_updated') {
          console.log("Realtime: Banco de dados alterado por outro usuário (ou por nós). Disparando refresh...");
          if (typeof callback === 'function') {
            callback();
          }
        }
      } catch (err) {
        console.error("Erro ao fazer parse do evento SSE:", err);
      }
    };

    evtSource.onerror = (err) => {
      console.warn("Realtime: Conexão SSE falhou ou foi desconectada. Tentando reconectar automaticamente...");
    };
    
    return evtSource;
  } catch (err) {
    console.error("Erro ao iniciar sincronização realtime SSE:", err);
    return null;
  }
}

// ==========================================
// MÓDULO: EVIDÊNCIAS (Indicadores / Diagnóstico)
// ==========================================
export async function carregarAlbuns(mes) {
  const cache = localStorage.getItem('albuns_mensais');
  let data = cache ? JSON.parse(cache) : null;
  
  if (!data) {
    data = [
      { id: 'album1', mes: '07/2026', titulo: 'Por que estamos nesta situação?' },
      { id: 'album2', mes: '07/2026', titulo: 'Déficit de Treinamento / Processos' }
    ];
    localStorage.setItem('albuns_mensais', JSON.stringify(data));
  }

  // --- MIGRAÇÃO DE FOTOS ÓRFÃS ---
  const evCache = localStorage.getItem('evidencias_mensais');
  if (evCache) {
    let evs = JSON.parse(evCache);
    let mudou = false;
    evs.forEach(e => {
      if (!e.album_id) {
        let alb = data.find(a => a.mes === e.mes);
        if (!alb) {
          alb = { id: 'album_migrado_' + Math.random().toString(36).substring(7), mes: e.mes, titulo: 'Fotos Antigas' };
          data.push(alb);
          localStorage.setItem('albuns_mensais', JSON.stringify(data));
        }
        e.album_id = alb.id;
        mudou = true;
      }
    });
    if (mudou) {
      localStorage.setItem('evidencias_mensais', JSON.stringify(evs));
    }
  }

  return data.filter(a => a.mes === mes);
}

export async function salvarAlbum(album) {
  const cache = localStorage.getItem('albuns_mensais');
  let data = cache ? JSON.parse(cache) : [];
  if (!album.id) album.id = 'album_' + Date.now().toString();
  const idx = data.findIndex(a => a.id === album.id);
  if (idx >= 0) data[idx] = album;
  else data.push(album);
  localStorage.setItem('albuns_mensais', JSON.stringify(data));
  return album;
}

export async function excluirAlbum(id) {
  const cache = localStorage.getItem('albuns_mensais');
  let data = cache ? JSON.parse(cache) : [];
  data = data.filter(a => a.id !== id);
  localStorage.setItem('albuns_mensais', JSON.stringify(data));
  
  // Apagar fotos em cascata
  const cacheEv = localStorage.getItem('evidencias_mensais');
  let evData = cacheEv ? JSON.parse(cacheEv) : [];
  evData = evData.filter(e => e.album_id !== id);
  localStorage.setItem('evidencias_mensais', JSON.stringify(evData));
}

export async function carregarEvidenciasDoAlbum(album_id) {
  const cache = localStorage.getItem('evidencias_mensais');
  let data = cache ? JSON.parse(cache) : null;
  
  if (!data) {
    data = [
      { id: '1', album_id: 'album1', titulo: 'Situações Críticas (Quadro Elétrico)', descricao: 'Equipamentos em situações críticas e básicas...', foto_url: 'img/evidencias/critica1.png' },
      { id: '2', album_id: 'album1', titulo: 'Situações Críticas (Lâminas)', descricao: 'Desgaste severo.', foto_url: 'img/evidencias/critica2.png' },
      { id: '3', album_id: 'album1', titulo: 'Situações Críticas (Sensores)', descricao: 'Sensores adaptados com abraçadeiras, sem fixação adequada.', foto_url: 'img/evidencias/critica3.png' },
      { id: '4', album_id: 'album1', titulo: 'Situações Críticas (Tubos)', descricao: 'Tubos e estrutura com desgastes.', foto_url: 'img/evidencias/critica4.png' },
      { id: '5', album_id: 'album2', titulo: 'Nível de Experiência - Eletrônicos', descricao: 'Novos: Carlos Alberto / Rodolpho / Carlos Shiavon / Natanael / Danilo / Alan\nExperientes: Michael / Mauricio' },
      { id: '6', album_id: 'album2', titulo: 'Nível de Experiência - Mecânicos', descricao: 'Novos: Francisco / Edvaldo / Edmilson / Tecnico mecânico 2 (Em fase de contratação) / Tecnico mecânico 1 (Em fase de contratação)\nExperientes: Diego / Robson / Fernando / Cezar / Willians / Alessandro / Cleber' },
      { id: '7', album_id: 'album2', titulo: 'Capacitação Técnica', descricao: 'Mesmos os mecânicos e eletrônicos mais experientes do nosso time nunca receberam um treinamento específico de nenhuma máquina, tudo o que é feito é baseado na expertise de cada um.' },
      { id: '8', album_id: 'album2', titulo: 'Falta de Procedimentos', descricao: 'Tambor que nós erramos na montagem durante a preventiva da linha 7.\nNão realizamos inúmeras manutenções (Limpeza destes tambores e até hoje não temos a identificação das peças e procedimentos e métodos de montagem).' }
    ];
    localStorage.setItem('evidencias_mensais', JSON.stringify(data));
  }

  return data.filter(e => e.album_id === album_id);
}

export async function salvarEvidencia(evidencia) {
  const cache = localStorage.getItem('evidencias_mensais');
  let data = cache ? JSON.parse(cache) : [];
  if (!evidencia.id) evidencia.id = Date.now().toString();
  const idx = data.findIndex(e => e.id === evidencia.id);
  if (idx >= 0) data[idx] = evidencia;
  else data.push(evidencia);
  localStorage.setItem('evidencias_mensais', JSON.stringify(data));
  return evidencia;
}

export async function excluirEvidencia(id) {
  const cache = localStorage.getItem('evidencias_mensais');
  let data = cache ? JSON.parse(cache) : [];
  data = data.filter(e => e.id !== id);
  localStorage.setItem('evidencias_mensais', JSON.stringify(data));
}
