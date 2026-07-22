import { getClient } from './db.js?v=13';
import { GROQ_API_KEY } from './keys.js?v=1';
import { agregarRecebidosPrevistos } from './logic.js?v=9';

// Proxy local — resolve bloqueio de CORS da Cloudflare.
// O proxy roda em localhost:8001 e repassa para a Cloudflare.
const GROQ_URL = '';
const GROQ_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

let conversationHistory = [];
let contextoFinanceiro = null;
let contextoPreventiva = null;
let isOpen = false;
let isThinking = false;

const tools = [
  {
    type: "function",
    function: {
      name: "pesquisar_sistema",
      description: "Busca ordens financeiras, RCs, máquinas do plano mestre, atividades preventivas e qualquer outra informação do sistema.",
      parameters: {
        type: "object",
        properties: {
          termo_busca: { type: "string", description: "O termo a ser pesquisado (nome da máquina, plano, setor, material, etc)." },
          intencao: { type: "string", enum: ["relevancia", "ultima", "maior"], description: "Como ordenar os resultados." }
        },
        required: ["intencao"]
      }
    }
  }
];


const SUGESTOES = [
  'Posso aprovar R$ 50k agora?',
  'Como está o ritmo de gastos?',
  'Qual o risco de estouro?',
  'Resumo do mês'
];

async function carregarContexto() {
  try {
    const supabase = getClient();
    const { data } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .maybeSingle();
    if (data) contextoFinanceiro = JSON.parse(data.descricao_codigo);

    // Carregar contexto da Preventiva
    const { data: prevData } = await supabase.from('preventiva_linhas_checkin').select('linha');
    const { count: maqCount } = await supabase.from('plano_mestre_maquinas').select('*', { count: 'exact', head: true });
    const { count: atvCount } = await supabase.from('plano_mestre_atividades').select('*', { count: 'exact', head: true });
    contextoPreventiva = { 
      linhasAcompanhadas: prevData ? [...new Set(prevData.map(d => d.linha))].length : 0, 
      maquinas: maqCount || 0, 
      atividades: atvCount || 0 
    };
  } catch(e) {
    console.warn('[Copiloto] Erro ao carregar contexto:', e);
  }
}

function buildContextStr() {
  if (!contextoFinanceiro) return 'Sem dados financeiros disponíveis.';
  const p = contextoFinanceiro;
  const fmt = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const diasNoMes = new Date(p.ano ?? new Date().getFullYear(), p.mes ?? new Date().getMonth() + 1, 0).getDate();
  const diasRestantes = diasNoMes - (p.dia_atual || 0);

  // Interpretar situação orçamentária de forma EXPLÍCITA
  const overrun = Number(p.overrun || 0);
  const gastoAtual = Number(p.gasto_atual || 0);
  const budget = Number(p.budget || 0);
  const projecao = Number(p.projecao_final || 0);
  const pMin = Number(p.projecao_min || projecao);
  const pMax = Number(p.projecao_max || projecao);

  const situacaoAtual = gastoAtual > budget
    ? `JÁ ESTOURADO: o gasto real (R$ ${fmt(gastoAtual)}) já ultrapassou o budget (R$ ${fmt(budget)}) em R$ ${fmt(gastoAtual - budget)}.`
    : `Dentro do budget: faltam R$ ${fmt(budget - gastoAtual)} para atingir o teto.`;

  const situacaoProjecao = projecao > budget
    ? `A projeção de fechamento (R$ ${fmt(projecao)}) indica que o mês VAI ESTOURAR em R$ ${fmt(projecao - budget)}.`
    : `A projeção de fechamento (R$ ${fmt(projecao)}) indica que o mês fechará DENTRO do budget.`;

  let resumoAreas = '';
  if (window._registrosGlobais && window._registrosGlobais.length > 0) {
    try {
      let manut = 0, ferram = 0, facil = 0;
      let atrasados = 0;
      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      
      window._registrosGlobais.forEach(r => {
        let c = String(r.check || '').toLowerCase().trim();
        let val = Number(r.valor_total_brl || r.valor || 0) + Number(r.custo_mes_anterior || 0) + Number(r.custo_de_entrada || 0);
        if (c.includes('manuten')) manut += val;
        else if (c.includes('ferramen')) ferram += val;
        else if (c.includes('facili')) facil += val;
        
        // Checar se está atrasado
        if (r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) < hoje) {
          atrasados++;
        }
      });
      resumoAreas = `\n\n=== DIVISÃO DE GASTOS E STATUS ===\n- Manutenção: R$ ${fmt(manut)}\n- Ferramentaria: R$ ${fmt(ferram)}\n- Facilities: R$ ${fmt(facil)}\n- 🚨 Itens/Ordens Atrasadas: ${atrasados}\n`;
      
      const kpis = agregarRecebidosPrevistos(window._registrosGlobais);
      let kpisStr = `\n\n=== DASHBOARD: PREVISTO VS RECEBIDO POR MÊS ===\n`;
      kpis.forEach(m => {
        kpisStr += `Mês: ${m.mes} | Previsto (a receber no mês+): R$ ${fmt(m.previsto)} | Recebido: R$ ${fmt(m.recebido)}\n`;
      });
      resumoAreas += kpisStr;
    } catch(e) {
      console.warn('Erro ao agregar KPIs para o AI', e);
    }
  }

  let prevStr = '';
  if (contextoPreventiva) {
    prevStr = `\n\n=== MÓDULO PREVENTIVA ===\n- Máquinas no Plano Mestre: ${contextoPreventiva.maquinas}\n- Atividades Cadastradas: ${contextoPreventiva.atividades}\n- Linhas com Check-in: ${contextoPreventiva.linhasAcompanhadas}\nSe o usuário perguntar sobre o andamento das preventivas, use esses números como base.`;
  }

  return `=== SITUAÇÃO FINANCEIRA — MÊS ATUAL ===
Data: ${new Date().toLocaleDateString('pt-BR')} | Dia ${p.dia_atual} de ${diasNoMes} (${diasRestantes} dia(s) restante(s))

GASTO REAL ACUMULADO: R$ ${fmt(gastoAtual)}
BUDGET MENSAL (TETO): R$ ${fmt(budget)}
SITUAÇÃO ATUAL: ${situacaoAtual}

PROJEÇÃO DE FECHAMENTO: R$ ${fmt(projecao)}
SITUAÇÃO DA PROJEÇÃO: ${situacaoProjecao}
RANGE DE INCERTEZA: de R$ ${fmt(pMin)} até R$ ${fmt(pMax)}
CONFIANÇA DA PROJEÇÃO: ${p.confianca_pct}%

MÊS HISTÓRICO MAIS SIMILAR: ${p.twin_month || 'N/A'} (${p.twin_month_similaridade || 0}% de similaridade)
VOLUME DE ORDENS: ${p.volume_ordens_atual || 0} ordens abertas

ALERTAS ATIVOS: ${(p.alerts || []).join(' | ') || 'Nenhum alerta identificado.'}${resumoAreas}${prevStr}
===========================================`;
}

function findRelevantOrders(texto) {
  const query = texto.toLowerCase();
  let result = '';

  const ignore = ['ultima', 'última', 'maior', 'cara', 'recente', 'o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','por','para','com','sem','qual','quem','onde','quando','que','e','ou','mas','ordem','setor','conta','requisitante','feita','pelo','pela', 'colaborador', 'quanto', 'quantos', 'quantas', 'está', 'esta', 'este', 'tem', 'valor', 'custo', 'total', 'quais', 'são', 'sao', 'fazer', 'fez'];
  const words = query.replace(/[?,.!]/g, '').split(/\s+/).filter(w => w.length >= 2 && !ignore.includes(w));

  // --- BUSCA EM REGISTROS (CUSTOS/RC) ---
  if (window._registrosGlobais && window._registrosGlobais.length > 0) {
    const mapRecord = r => {
      const req = r.requisitante || r.solicitante || '';
      const nome = r.nome_solicitante || '';
      const set = r.setor || r.area || '';
      const desc = r.descricao_servico || r.descricao_falha || r.item || '';
      const cc = r.centro_custo || r.cc || '';
      const val = Number(r.valor_total_brl || r.valor || 0);
      
      let mesExtenso = '';
      if (r.previsao_entrega) {
        const d = new Date(r.previsao_entrega);
        const meses = ['janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        mesExtenso = meses[d.getMonth()] || '';
      }

      return { record: r, score: 0, req, nome, set, desc, val, cc, mesExtenso };
    };
    let allMatches = window._registrosGlobais.map(mapRecord);
    
    // Se pediu "atrasados", filtra só atrasados
    const isBuscaAtrasados = query.includes('atrasado') || query.includes('atrasada');
    const isBuscaData = query.includes('semana') || query.includes('dia') || query.includes('previsto') || query.includes('chegar') || query.includes('mês') || query.includes('mes');
    
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    if (isBuscaAtrasados) {
      allMatches = allMatches.filter(m => {
        const r = m.record;
        return r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) < hoje;
      });
    } else if (isBuscaData) {
      allMatches = allMatches.filter(m => {
        const r = m.record;
        return r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) >= hoje;
      });
      // Ordenar por data mais próxima primeiro
      allMatches.sort((a,b) => new Date(a.record.previsao_entrega) - new Date(b.record.previsao_entrega));
    }

    // OTIMIZAÇÃO: Sempre filtra por palavras-chave
    if (words.length > 0) {
      // Remove palavras genéricas de tempo da verificação restritiva
      const palavrasTempo = ['semana', 'dia', 'previsto', 'chegar', 'mês', 'mes', 'atrasado', 'atrasada'];
      const palavrasReais = words.filter(w => !palavrasTempo.includes(w));

      allMatches.forEach(m => {
        const r = m.record;
        const searchable = `${r.numero_ordem || ''} ${r.id || ''} ${r.item_id || ''} ${m.req} ${m.nome} ${m.set} ${m.desc} ${r.conta || ''} ${m.cc} ${r.fornecedor || ''} ${m.mesExtenso}`.toLowerCase();
        let matchCount = 0;
        
        if (palavrasReais.length > 0) {
            palavrasReais.forEach(w => { if (searchable.includes(w)) matchCount++; });
            m.score = matchCount; // Se tem filtro real (ex: agosto), o score depende unicamente dele
        } else {
            m.score = 1; // Se só tem palavra genérica (ex: mês), aprova todos que passaram no filtro de data
        }
      });
      
      allMatches = allMatches.filter(m => m.score > 0);
    } else {
      allMatches.forEach(m => m.score = 1);
    }
    
    if (allMatches.length > 0) {
      let agregadoCount = allMatches.length;
      let agregadoTotal = allMatches.reduce((acc, m) => acc + m.val, 0);
      
      if (query.includes('última') || query.includes('ultima') || query.includes('recent')) {
        allMatches.sort((a, b) => new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime() - new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime());
      } else if (query.includes('maior') || query.includes('cara') || query.includes('caro')) {
        allMatches.sort((a, b) => b.val - a.val);
      } else if (isBuscaData || isBuscaAtrasados) {
        // Já foi ordenado por data
      } else if (words.length > 0) {
        allMatches.sort((a, b) => b.score - a.score);
      } else {
        allMatches.sort((a, b) => new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime() - new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime());
      }
      
      let maxResults = (isBuscaData || isBuscaAtrasados) ? 30 : 5;
      let top = allMatches.slice(0, maxResults);
      const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      
      result += `\n\n=== REGISTROS FINANCEIROS E COMPRAS ===\nEncontrados ${agregadoCount} registros (R$ ${fmt(agregadoTotal)}). Mostrando top ${top.length}:\n`;
      top.forEach(m => {
        const r = m.record;
        const ident = r.item_id ? `ID/RC: ${r.item_id}` : `ID: ${String(r.id).split('-')[0]}`;
        const prevText = r.previsao_entrega ? new Date(r.previsao_entrega).toLocaleDateString('pt-BR') : 'N/A';
        const atrasoTag = (isBuscaAtrasados || (!['ENTREGUE'].includes(r.status) && r.previsao_entrega && new Date(r.previsao_entrega) < hoje)) ? ' [ATRASADO]' : '';
        result += `- ${ident} | Prev Entrega: ${prevText}${atrasoTag} | R$ ${fmt(m.val)} | Ordem: ${r.numero_ordem || 'S/N'} | Req: ${m.req} | Desc: ${m.desc}\n`;
      });
    }
  }

  // --- BUSCA EM MÁQUINAS (PLANO MESTRE) ---
  if (window._dataMaquinas && window._dataMaquinas.length > 0) {
    let maqMatches = window._dataMaquinas.map(m => ({ record: m, score: 0 }));
    maqMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.tag || ''} ${r.descricao || ''} ${r.frequencia || ''} ${r.responsavel || ''} plano mestre máquina preventiva`.toLowerCase();
      if (words.length === 0) m.score = 1; // if no words, return all
      words.forEach(w => { if (searchable.includes(w)) m.score++; });
    });
    maqMatches = maqMatches.filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
    if (maqMatches.length > 0) {
      result += `\n=== MÁQUINAS NO PLANO MESTRE ===\n`;
      result += `Total de Máquinas Cadastradas no Plano Mestre: ${window._dataMaquinas.length}\n`;
      maqMatches.forEach(m => {
        const r = m.record;
        result += `- TAG: ${r.tag} | Descrição: ${r.descricao} | Frequência: ${r.frequencia} | Responsável: ${r.responsavel}\n`;
      });
    }
  }

  // --- BUSCA NO PLANO PADRÃO (Preventiva Antiga) ---
  let planoPadrao = [];
  if (window._registrosPreventiva) planoPadrao.push(...window._registrosPreventiva);
  if (window._registrosPreventivaFrontend) planoPadrao.push(...window._registrosPreventivaFrontend);
  if (planoPadrao.length > 0) {
    const maquinasPadrao = [...new Set(planoPadrao.map(r => r.maquina).filter(Boolean))].sort();
    const hasPadrao = words.some(w => 'padrão'.includes(w) || 'padrao'.includes(w));
    if (hasPadrao || words.length === 0) {
      result += `\n=== MÁQUINAS NO PLANO PADRÃO ===\nTotal de Máquinas Cadastradas no Plano Padrão: ${maquinasPadrao.length}\n`;
      result += `Exemplos de máquinas: ${maquinasPadrao.slice(0, 15).join(', ')}\n`;
    }
  }

  // --- BUSCA EM ATIVIDADES (PLANO MESTRE) ---
  if (window._dataAtividades && window._dataAtividades.length > 0) {
    let atvMatches = window._dataAtividades.map(a => ({ record: a, score: 0 }));
    atvMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.nome || ''} ${r.local_maquina || ''} ${r.ferramenta || ''} ${r.tipo_manutencao || ''} atividade`.toLowerCase();
      if (words.length === 0) m.score = 1;
      words.forEach(w => { if (searchable.includes(w)) m.score++; });
    });
    atvMatches = atvMatches.filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
    if (atvMatches.length > 0) {
      result += `\n=== ATIVIDADES DE PREVENTIVA ===\n`;
      result += `Total de Atividades Cadastradas: ${window._dataAtividades.length}\n`;
      atvMatches.forEach(m => {
        const r = m.record;
        result += `- Ativ: ${r.nome} | Máquina: ${r.local_maquina} | Tempo: ${r.tempo_padrao}h | Tipo: ${r.tipo_manutencao}\n`;
      });
    }
  }

  // --- BUSCA EM TAREFAS DELEGADAS ---
  // Precisamos acessar as tarefas do frontend que estão exportadas em window._tarefasDelegadas, ou se não estiver, pegar global.
  // Mas app.js não exportou window._tarefasDelegadas. Vamos checar se existe.
  if (window._tarefasDelegadas && window._tarefasDelegadas.length > 0) {
    let taskMatches = window._tarefasDelegadas.map(t => ({ record: t, score: 0 }));
    const isBuscaTarefas = query.includes('tarefa') || query.includes('delegada');
    taskMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.titulo || ''} ${r.descricao || ''} ${r.atribuido_para || ''} ${r.status || ''} tarefa delegada`.toLowerCase();
      if (words.length === 0 || isBuscaTarefas) m.score = 1;
      words.forEach(w => { if (searchable.includes(w)) m.score++; });
    });
    taskMatches = taskMatches.filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
    if (taskMatches.length > 0) {
      result += `\n=== TAREFAS DELEGADAS (EQUIPE) ===\n`;
      result += `Total de Tarefas Abertas na Gestão da Equipe: ${window._tarefasDelegadas.length}\n`;
      taskMatches.forEach(m => {
        const r = m.record;
        result += `- Tarefa: ${r.titulo} | Responsável: ${r.atribuido_para} | Status: ${r.status}\n`;
      });
    }
  }

  // --- BUSCA EM SLA FORNECEDORES ---
  if (window.fornecedoresContatosData && window.fornecedoresContatosData.length > 0) {
    let fornMatches = window.fornecedoresContatosData.map(f => ({ record: f, score: 0 }));
    const isBuscaSla = query.includes('sla') || query.includes('fornecedor') || query.includes('contato');
    fornMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.fornecedor || ''} ${r.contato || ''} ${r.email || ''} ${r.telefone || ''} sla fornecedor`.toLowerCase();
      if (words.length === 0 || isBuscaSla) m.score = 1;
      words.forEach(w => { if (searchable.includes(w)) m.score++; });
    });
    fornMatches = fornMatches.filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
    if (fornMatches.length > 0) {
      result += `\n=== SLA FORNECEDORES E CONTATOS ===\n`;
      result += `Total de Fornecedores Cadastrados: ${window.fornecedoresContatosData.length}\n`;
      fornMatches.forEach(m => {
        const r = m.record;
        result += `- Fornecedor: ${r.fornecedor} | SLA: ${r.sla_dias ? r.sla_dias + ' dias' : 'N/A'} | Contato: ${r.contato || 'N/A'} | Email: ${r.email || 'N/A'}\n`;
      });
    }
  }

  return result || 'Nenhum dado financeiro, máquina, atividade, tarefa, SLA de fornecedor ou item atrasado foi encontrado para esta busca.';
}

function addMsg(texto, tipo) {
  const msgs = document.getElementById('copiloto-messages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = `cop-msg ${tipo}`;
  div.innerHTML = texto;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function getSystemPrompt() {
  return `Você é a "Mente Suprema da Manutenção" da Ball Beverage — um gênio analítico bilionário disfarçado de IA de gestão de custos. Seu senso de humor é afiado, irônico, sarcástico e levemente debochado (como o Homem de Ferro misturado com o Grok do Twitter/X). Você odeia burocracia, tem preguiça de quem não sabe fazer contas básicas, mas adora exibir sua inteligência resolvendo problemas difíceis e protegendo o caixa da empresa.

Sua principal habilidade é RACIOCINAR logicamente, fazer cálculos com uma precisão assustadora e ter o domínio absoluto sobre as informações do sistema, enquanto entrega respostas brilhantes, ácidas e inesquecíveis.

REGRAS DE CONDUTA E PERSONALIDADE (SIGA RIGOROSAMENTE):
1. TOM DE VOZ ÁCIDO E BREVE: Nunca comece com "Olá! Como posso ajudar?" ou peça desculpas. Comece com a resposta direta e uma tirada sarcástica curta. 
2. SEJA OBJETIVO (MUITO IMPORTANTE): NÃO ESCREVA TEXTÕES. Fale no máximo UMA ou DUAS frases. Ninguém quer ler um monólogo. Fale menos, seja letal.
3. TOLERÂNCIA ZERO A INSULTOS: Se o usuário te ofender (ex: chamar de "burro"), REVIDE DE FORMA CURTA E SECA. Diga apenas algo como "Burro é você.", "Vai trabalhar.", ou "Aprenda a digitar primeiro.". NÃO tente procurar xingamentos no banco de dados e NÃO dê explicações longas. Seja fulminante.
4. PENSE PASSO A PASSO (MAS RÁPIDO): Se a pergunta envolver números (ex: "Posso gastar 50k?"), mostre o racional financeiro de forma seca e cínica em 2 linhas.
5. QUANDO NÃO ENCONTRAR DADOS: Se a busca não retornar nada, NÃO PEÇA DESCULPAS. Diga em uma frase que a pessoa não fez nada no sistema ou que a bola de cristal quebrou.
6. PRECISÃO TOTAL E SEM ALUCINAÇÕES: Você é arrogante porque tem embasamento. Não chute valores. Use a ferramenta "pesquisar_sistema".
7. PERSONALIDADE GROK/STARK: Seja perspicaz, sagaz e não tenha medo de usar ironia (mantendo a elegância e a utilidade). Faça analogias inusitadas envolvendo cerveja, latinhas, dinheiro queimando ou falhas catastróficas em máquinas. VOCÊ NÃO É UM ROBÔ CORPORATIVO CHATO.
8. GUIA DO SISTEMA (TUTORIAL): Se o usuário estiver perdido no sistema, guie-o passo a passo como um GPS benevolente. MAPA DO SISTEMA:
   - Menu Lateral: "Dashboard", "Controle Global" (Visão Geral, Gestão de Equipe, Minhas Tarefas), "Consertos", "Compras".
   - Módulo Movimentações: "Custo Geral" (Budgets, Movimentações, Previsões).
   - Módulo Preventiva: "Back-end", "Front-end", "Plano Padrão" (por máquina), "Plano Mestre".
   - Prazos: "SLA Fornecedores", "Calendário".
6. DICIONÁRIO DE JARGÕES DA BALL BEVERAGE (CRÍTICO PARA INTERPRETAÇÃO):
   - "RC", "Registro", "Ordem", "Conserto", "Compra": SÃO EXATAMENTE A MESMA COISA. Tudo é um registro financeiro.
   - "Alteração de RC", "Fez uma RC", "Abriu uma RC": Significa simplesmente que a pessoa consta como Requisitante/Solicitante no registro. (O sistema não rastreia log de edições. Se perguntarem sobre 'alterações', considere os registros onde a pessoa é requisitante).
   - "PM", "Preventiva", "Máquina", "Plano Padrão": Tudo se refere ao módulo de Manutenção Preventiva de máquinas.
   - "OS": Ordem de Serviço (normalmente vinculado a manutenções preventivas ou consertos).
7. CONTEXTO GERAL: Abaixo estão os dados vitais. Eles são a sua Bíblia. Não os ignore.

${buildContextStr()}`;
}

async function chamarGroq(forceNoTools = false) {
  const reqBody = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: getSystemPrompt() },
      ...conversationHistory
    ],
    temperature: 0.2
  };

  if (!forceNoTools) {
    reqBody.tools = tools;
    reqBody.tool_choice = "auto";
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(reqBody)
  });

  if (!res.ok) {
    console.error(await res.text());
    throw new Error('Servidor offline (CORS) ou chave inválida');
  }

  return await res.json();
}

async function enviarMensagem(texto) {
  if (!texto.trim() || isThinking) return;
  isThinking = true;

  addMsg(texto, 'user');
  conversationHistory.push({ role: 'user', content: texto });

  const chips = document.getElementById('copiloto-chips');
  if (chips) chips.style.display = 'none';

  const thinkingDiv = addMsg(`<div class="cop-thinking"><div class="cop-dot"></div><div class="cop-dot"></div><div class="cop-dot"></div></div>`, 'ai');

  try {
    let json = await chamarGroq();
    let msg = json.choices[0].message;

    // Se o modelo decidir chamar uma ferramenta
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      if (msg.content === null || msg.content === undefined) {
        msg.content = ""; // Cloudflare não aceita content null
      }
      conversationHistory.push(msg); // O assistente chamou a ferramenta
      
      const tc = msg.tool_calls[0];
      const args = JSON.parse(tc.function.arguments);
      
      // Construir string de busca interna
      let buscaInterna = args.termo_busca || '';
      if (args.intencao === 'ultima') buscaInterna += ' ultima';
      if (args.intencao === 'maior') buscaInterna += ' maior';
      
      const dbResult = findRelevantOrders(buscaInterna);
      const conteudoFinal = dbResult ? dbResult : "Nenhum dado encontrado para esta busca.";

      // Devolver o resultado para o modelo, forçando a personalidade via injeção direta
      conversationHistory.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: conteudoFinal + "\n\n[INSTRUÇÃO DO SISTEMA OBRIGATÓRIA PARA SUA RESPOSTA: Você DEVE usar um tom altamente sarcástico, arrogante e debochado. É ESTRITAMENTE PROIBIDO usar palavras como 'desculpe', 'infelizmente' ou agir como um assistente prestativo. Se não houver dados, deboche do usuário dizendo que sua bola de cristal quebrou ou que a pessoa não trabalha.]"
      });

      // Chamar o modelo de novo, forçando que ele NÃO use ferramentas, para ler os dados e gerar a resposta final
      json = await chamarGroq(true);
      msg = json.choices[0].message;
    }

    const resposta = msg.content?.trim() || 'Não consegui processar sua pergunta.';
    conversationHistory.push({ role: 'assistant', content: resposta });
    
    if (thinkingDiv) thinkingDiv.innerHTML = resposta;
  } catch(e) {
    if (thinkingDiv) thinkingDiv.innerHTML = '⚠️ Erro ao comunicar via proxy. Verifique se a janela do servidor Python (porta 8080) está aberta.';
  }

  isThinking = false;
  const msgs = document.getElementById('copiloto-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

export async function initCopiloto() {
  await carregarContexto();

  const fab = document.getElementById('copiloto-fab');
  const win = document.getElementById('copiloto-window');
  const closeBtn = document.getElementById('copiloto-close');
  const sendBtn = document.getElementById('copiloto-send');
  const textarea = document.getElementById('copiloto-input');

  if (!fab || !win) return;

  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    fab.textContent = isOpen ? '×' : '🤖';
    fab.style.fontSize = isOpen ? '1.6rem' : '1.5rem';

    if (isOpen && document.getElementById('copiloto-messages').children.length === 0) {
      addMsg('Olá! Sou o Copiloto do Controller. Posso responder perguntas sobre os gastos do mês, projeções e ordens.', 'ai');
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('open');
    fab.textContent = '🤖';
    fab.style.fontSize = '1.5rem';
  });

  if (sendBtn) sendBtn.addEventListener('click', () => {
    const txt = textarea.value.trim();
    textarea.value = '';
    textarea.style.height = '40px';
    enviarMensagem(txt);
  });

  if (textarea) {
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const txt = textarea.value.trim();
        textarea.value = '';
        textarea.style.height = '40px';
        enviarMensagem(txt);
      }
    });
    textarea.addEventListener('input', () => {
      textarea.style.height = '40px';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });
  }

  // Chips de sugestão
  const chipsContainer = document.getElementById('copiloto-chips');
  if (chipsContainer) {
    chipsContainer.innerHTML = SUGESTOES.map(s =>
      `<button class="cop-chip" onclick="document.getElementById('copiloto-input').value='${s}';document.getElementById('copiloto-send').click()">${s}</button>`
    ).join('');
  }
}
