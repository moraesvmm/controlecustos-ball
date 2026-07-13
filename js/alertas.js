// js/alertas.js — Módulo de Alertas de Tendência
import { getClient } from './db.js';

let alertasData = [];

// Chave de armazenamento local para rastrear alertas já lidos
const LS_KEY = 'alertas_lidos_hash';

function hashAlertas(arr) {
  return arr.map(a => a.texto || a).join('|');
}

function marcarComoLido() {
  localStorage.setItem(LS_KEY, hashAlertas(alertasData));
  ocultarBadge();
}

function foramLidos() {
  return localStorage.getItem(LS_KEY) === hashAlertas(alertasData);
}

function ocultarBadge() {
  const badge = document.getElementById('alertaBadgeCount');
  if (badge) badge.style.display = 'none';
}

export async function initAlertas() {
  try {
    const supabase = getClient();
    const { data } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .maybeSingle();

    if (!data) return;
    const p = JSON.parse(data.descricao_codigo);
    alertasData = p.alerts || [];

    // Enriquecer com nível de severidade
    alertasData = alertasData.map(a => ({
      texto: a,
      nivel: a.toLowerCase().includes('pico') || a.toLowerCase().includes('crítico') || a.toLowerCase().includes('crítica') ? 'danger'
           : a.toLowerCase().includes('atenção') || a.toLowerCase().includes('acima') ? 'warning'
           : 'info'
    }));

    renderBadge();
  } catch (e) {
    console.warn('[Alertas] Erro ao carregar:', e);
  }
}

function renderBadge() {
  const badge = document.getElementById('alertaBadgeCount');
  if (!badge) return;

  // Se já foram lidos (mesmos alertas de antes), não mostrar badge
  if (alertasData.length === 0 || foramLidos()) {
    badge.style.display = 'none';
  } else {
    badge.textContent = alertasData.length;
    badge.style.display = 'flex';
  }
}

export function toggleAlertasPanel() {
  const painel = document.getElementById('alertas-painel');
  const overlay = document.getElementById('alertas-painel-overlay');
  if (!painel) return;

  const isOpen = painel.classList.contains('open');
  if (isOpen) {
    fecharAlertasPanel();
  } else {
    renderAlertasPanel();
    painel.classList.add('open');
    overlay.classList.add('open');
    // Ao abrir o painel, marca automaticamente como lido
    marcarComoLido();
  }
}

export function fecharAlertasPanel() {
  document.getElementById('alertas-painel')?.classList.remove('open');
  document.getElementById('alertas-painel-overlay')?.classList.remove('open');
}

function renderAlertasPanel() {
  const body = document.getElementById('alertas-body');
  if (!body) return;

  if (alertasData.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--muted);">
        <div style="font-size:2rem;margin-bottom:0.5rem;">✅</div>
        <p style="font-size:0.9rem;">Nenhum alerta de tendência identificado.<br>O ritmo de gastos está dentro do esperado.</p>
      </div>`;
    return;
  }

  const icones = { danger: '🔴', warning: '⚠️', info: '💡' };
  const titulos = { danger: 'Alerta Crítico', warning: 'Atenção', info: 'Informação' };

  body.innerHTML = alertasData.map(a => `
    <div class="alerta-card ${a.nivel}">
      <div class="alerta-titulo">${icones[a.nivel]} ${titulos[a.nivel]}</div>
      <div>${a.texto}</div>
    </div>
  `).join('') + `
    <div style="margin-top:0.5rem;padding-top:0.75rem;border-top:1px solid var(--border);text-align:right;">
      <button onclick="import('./js/alertas.js').then(m=>m.forcarMarcarComoLido())"
        style="background:none;border:1px solid var(--border);color:var(--muted);font-size:0.8rem;
               padding:0.4rem 0.9rem;border-radius:8px;cursor:pointer;transition:all 0.2s;"
        onmouseover="this.style.background='rgba(255,255,255,0.07)'"
        onmouseout="this.style.background='none'">
        ✓ Marcar como lida
      </button>
    </div>`;
}

// Exportado para o botão inline poder chamar
export function forcarMarcarComoLido() {
  marcarComoLido();
  fecharAlertasPanel();
}
