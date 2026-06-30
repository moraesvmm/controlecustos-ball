// js/copiloto.js — Copiloto do Controller (Chat com IA)
import { getClient } from './db.js?v=45';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'llama3';

let contextoFinanceiro = null;
let isOpen = false;
let isThinking = false;

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

ALERTAS ATIVOS: ${(p.alerts || []).join(' | ') || 'Nenhum alerta identificado.'}
===========================================`;
}

function findRelevantOrders(texto) {
  if (!window._registrosGlobais || window._registrosGlobais.length === 0) return '';
  
  const query = texto.toLowerCase();
  let matches = [];

  const mapRecord = r => {
    const req = r.requisitante || r.solicitante || '';
    const nome = r.nome_solicitante || '';
    const set = r.setor || r.area || '';
    const desc = r.descricao_servico || r.descricao_falha || r.item || '';
    const cc = r.centro_custo || r.cc || '';
    const val = Number(r.valor_total_brl || r.valor || 0);
    return { record: r, score: 0, req, nome, set, desc, val, cc };
  };

  if (query.includes('última') || query.includes('ultima') || query.includes('recent')) {
    matches = window._registrosGlobais
      .map(mapRecord)
      .sort((a, b) => {
        const dateA = new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime();
        const dateB = new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  } else if (query.includes('maior') || query.includes('mais cara') || query.includes('mais caro')) {
    matches = window._registrosGlobais
      .map(mapRecord)
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);
  } else {
    const ignore = ['o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','por','para','com','sem','qual','quem','onde','quando','que','e','ou','mas','ordem','setor','conta','requisitante','feita','pelo','pela', 'colaborador'];
    const words = query.replace(/[?,.!]/g, '').split(/\s+/).filter(w => w.length > 2 && !ignore.includes(w));
    
    if (words.length > 0) {
      matches = window._registrosGlobais.map(mapRecord).map(m => {
        const r = m.record;
        const searchable = `${r.numero_ordem || ''} ${m.req} ${m.nome} ${m.set} ${m.desc} ${r.conta || ''} ${m.cc} ${r.fornecedor || ''}`.toLowerCase();
        words.forEach(w => {
          if (searchable.includes(w)) m.score++;
        });
        return m;
      }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    }
  }

  if (matches.length === 0) return '';

  const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
  let result = `\n\n=== REGISTROS / RC'S DA BASE (CONTROLE GLOBAL) ===\nEstes são os registros/RCs/Ordens encontrados na base de dados que batem com o que o usuário pediu:\n`;
  matches.forEach(m => {
    const r = m.record;
    const n = m.nome ? ` (${m.nome})` : '';
    const ident = r.item_id ? `ID / RC: ${r.item_id}` : `ID / RC: ${String(r.id).split('-')[0]}`;
    result += `- ${ident} | Ordem: ${r.numero_ordem || 'S/N'} | Requisitante: ${m.req}${n} | Setor: ${m.set} | Valor: R$ ${fmt(m.val)} | Descrição: ${m.desc}\n`;
  });
  result += `==============================================\n`;
  
  return result;
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

async function enviarMensagem(texto) {
  if (!texto.trim() || isThinking) return;
  isThinking = true;

  addMsg(texto, 'user');

  // Limpar chips de sugestão
  const chips = document.getElementById('copiloto-chips');
  if (chips) chips.style.display = 'none';

  // Balao de "pensando"
  const thinkingDiv = addMsg(`<div class="cop-thinking"><div class="cop-dot"></div><div class="cop-dot"></div><div class="cop-dot"></div></div>`, 'ai');

  const relevantOrders = findRelevantOrders(texto);

  const prompt = `Você é o Copiloto do Controller da Ball Beverage, especialista em gestão de custos de manutenção industrial.
Responda em português, de forma CURTA e DIRETA (máximo 4 frases). Seja objetivo e prático.
NUNCA invente dados. Use APENAS os números fornecidos abaixo — nunca arredonde nem modifique os valores.
NUNCA diga que estamos dentro do orçamento se o campo "SITUAÇÃO ATUAL" disser "JÁ ESTOURADO".
NUNCA diga que a projeção é favorável se o campo "SITUAÇÃO DA PROJEÇÃO" disser que o mês vai estourar.
Fale como um Controller experiente, sem jargões técnicos de IA.

${buildContextStr()}
${relevantOrders}

PERGUNTA: ${texto}`;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 250 } })
    });

    if (!res.ok) throw new Error('Ollama offline');
    const json = await res.json();
    const resposta = json.response?.trim() || 'Não consegui processar sua pergunta.';
    if (thinkingDiv) thinkingDiv.innerHTML = resposta;
  } catch(e) {
    if (thinkingDiv) thinkingDiv.innerHTML = '⚠️ Ollama não está respondendo. Inicie via INICIAR_CONTROLE_RC.bat.';
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
