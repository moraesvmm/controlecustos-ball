// js/ai_tooltip.js — Tooltip Explicativo com IA (Ollama)

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'llama3';

let tooltipEl = null;

function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.getElementById('ai-tooltip-bubble');
  }
  return tooltipEl;
}

export async function showAITooltip(x, y, contexto) {
  const el = ensureTooltip();
  if (!el) return;

  // Posicionar o balão
  el.style.display = 'block';
  el.style.left = Math.min(x, window.innerWidth - 320) + 'px';
  el.style.top  = Math.max(y - 20, 80) + 'px';

  el.innerHTML = `
    <button class="ai-tooltip-close" onclick="document.getElementById('ai-tooltip-bubble').style.display='none'">×</button>
    <div class="ai-tooltip-label"><span class="ai-tooltip-spinner"></span> Analisando...</div>
    <div class="ai-tooltip-body">A IA está gerando uma explicação...</div>
  `;

  const prompt = `Você é um Controller Financeiro Senior da Ball Beverage.
Responda em português, de forma MUITO CURTA (máximo 3 frases), sem usar jargões técnicos.
Contexto financeiro: ${contexto}
Explique o que esse dado significa para o fechamento do mês de forma clara e direta.`;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 120 } })
    });

    if (!res.ok) throw new Error('Ollama indisponível');
    const json = await res.json();
    const texto = json.response?.trim() || 'Não foi possível gerar a explicação.';

    el.innerHTML = `
      <button class="ai-tooltip-close" onclick="document.getElementById('ai-tooltip-bubble').style.display='none'">×</button>
      <div class="ai-tooltip-label">✨ Análise da IA</div>
      <div class="ai-tooltip-body">${texto}</div>
    `;
  } catch (e) {
    el.innerHTML = `
      <button class="ai-tooltip-close" onclick="document.getElementById('ai-tooltip-bubble').style.display='none'">×</button>
      <div class="ai-tooltip-label">⚠️ Offline</div>
      <div class="ai-tooltip-body">Ollama não responde. Inicie o sistema via INICIAR_CONTROLE_RC.bat.</div>
    `;
  }
}

export function hideAITooltip() {
  const el = ensureTooltip();
  if (el) el.style.display = 'none';
}
