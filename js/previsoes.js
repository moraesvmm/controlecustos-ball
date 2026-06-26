// js/previsoes.js
import { getClient } from './db.js?v=45';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtK = (v) => {
  const abs = Math.abs(v);
  return abs >= 1e6
    ? (v / 1e6).toFixed(2).replace('.', ',') + 'M'
    : abs >= 1000
    ? (v / 1000).toFixed(0) + 'k'
    : fmt(v);
};

function horasDesde(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h === 0) return `${m}min atrás`;
  if (h < 24) return `${h}h ${m}min atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function badgeFrescor(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const h = diff / 3_600_000;
  if (h < 4)  return { cor: '#3cff78', icone: '🟢', label: 'Dados frescos' };
  if (h < 12) return { cor: '#facc15', icone: '🟡', label: 'Dados recentes' };
  return { cor: '#ff3c3c', icone: '🔴', label: 'Dados desatualizados' };
}

function confiancaBar(pct) {
  const cor = pct >= 75 ? '#3cff78' : pct >= 50 ? '#facc15' : '#ff7043';
  return `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.5rem;">
      <div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${cor};border-radius:4px;transition:width 0.6s;"></div>
      </div>
      <span style="font-size:0.8rem;font-weight:700;color:${cor};min-width:36px;">${pct}%</span>
    </div>`;
}

// ─── render principal ────────────────────────────────────────────────────────
export async function renderPrevisoes() {
  const container = document.getElementById('previsoes-container');
  if (!container) return;

  container.innerHTML = '<p style="color:#888;">Carregando modelo preditivo da nuvem...</p>';

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .single();

    if (error) throw error;

    const p          = JSON.parse(data.descricao_codigo);
    const isOverrun  = p.overrun > 0;
    const frescor    = badgeFrescor(p.atualizado_em);
    const horasAgo   = horasDesde(p.atualizado_em);

    // retrocompatível com payloads antigos
    const pMin        = p.projecao_min  ?? p.projecao_final;
    const pMax        = p.projecao_max  ?? p.projecao_final;
    const confianca   = p.confianca_pct ?? 50;
    const similaridade = p.twin_month_similaridade ?? 0;
    const vizinhos    = p.knn_vizinhos  ?? [];
    const alerts      = p.alerts        ?? [];
    const diasNoMes   = new Date(p.ano ?? new Date().getFullYear(), p.mes ?? new Date().getMonth() + 1, 0).getDate();

    // ── alertas de anomalia ───────────────────────────────────────────────
    const alertsHtml = alerts.length > 0
      ? alerts.map(a => `
          <div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.9rem 1.1rem;
                      background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.35);
                      border-radius:8px;">
            <span style="font-size:1.1rem;margin-top:1px;">⚡</span>
            <p style="margin:0;color:var(--text);font-size:0.875rem;line-height:1.5;">${a}</p>
          </div>`).join('')
      : `<p style="color:var(--muted);font-size:0.9rem;margin:0;">
           ✅ Nenhuma anomalia detectada nos últimos 7 dias.
         </p>`;

    // ── vizinhos KNN ──────────────────────────────────────────────────────
    const vizinhosHtml = vizinhos.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.75rem;">
           ${vizinhos.map((v, i) => `
             <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1rem;
                         background:rgba(255,255,255,0.03);border-radius:6px;
                         border:1px solid ${i === 0 ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.06)'};">
               <span style="font-size:0.75rem;font-weight:700;color:var(--muted);min-width:20px;">#${i+1}</span>
               <span style="flex:1;font-size:0.85rem;color:var(--text);">${v.month}</span>
               <span style="font-size:0.78rem;color:var(--muted);">R$ ${fmtK(v.proj)}</span>
               <span style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:12px;
                            background:rgba(255,215,0,0.1);color:#facc15;">${v.similaridade}%</span>
             </div>`).join('')}
         </div>`
      : '';

    const html = `
      <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:940px;margin:0 auto;width:100%;">

        <!-- ① Badge de frescor -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:0.5rem;">
          <span style="font-size:0.75rem;color:var(--muted);">Último cálculo: ${horasAgo}</span>
          <span style="font-size:0.75rem;font-weight:600;padding:3px 10px;border-radius:20px;
                        background:rgba(255,255,255,0.05);border:1px solid ${frescor.cor};
                        color:${frescor.cor};">${frescor.icone} ${frescor.label}</span>
        </div>

        <!-- ② Alerta principal -->
        <div style="padding:1.5rem;border-radius:10px;
                    background:${isOverrun ? 'rgba(255,60,60,0.08)' : 'rgba(60,255,120,0.08)'};
                    border:1px solid ${isOverrun ? '#ff3c3c' : '#3cff78'};">
          <div style="display:flex;align-items:flex-start;gap:1rem;">
            <div style="font-size:2rem;padding-top:2px;">${isOverrun ? '⚠️' : '✅'}</div>
            <div style="flex:1;">
              <h3 style="margin:0;color:${isOverrun ? '#ff3c3c' : '#3cff78'};font-size:1.2rem;">
                ${isOverrun ? 'Risco de Estouro de Budget' : 'Budget Saudável'}
              </h3>
              <p style="margin:0.5rem 0 0;color:var(--text);font-size:0.93rem;line-height:1.6;">
                No ritmo atual (dia <strong>${p.dia_atual}</strong>), o modelo projeta fechamento em
                <strong>R$ ${fmt(p.projecao_final)}</strong>
                — ${isOverrun ? 'estouro' : 'saldo'} de
                <strong>R$ ${fmt(Math.abs(p.overrun))}</strong>
                em relação ao target de R$ ${fmt(p.budget)}.
              </p>
              <p style="margin:0.4rem 0 0;color:var(--muted);font-size:0.82rem;">
                Range de incerteza: <strong style="color:var(--text);">R$ ${fmt(pMin)}</strong>
                até <strong style="color:var(--text);">R$ ${fmt(pMax)}</strong>
              </p>
            </div>
          </div>
        </div>

        <!-- ③ KPIs -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;">
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Gasto Atual (Dia ${p.dia_atual})
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:var(--text);">
              R$ ${fmtK(p.gasto_atual)}
            </p>
          </div>
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Budget Mensal
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:var(--gold);">
              R$ ${fmtK(p.budget)}
            </p>
          </div>
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);
                                    border:1px solid ${isOverrun ? '#ff3c3c' : 'transparent'};">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Projeção de Fechamento
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:${isOverrun ? '#ff3c3c' : 'var(--text)';}">
              R$ ${fmtK(p.projecao_final)}
            </p>
            <p style="margin:0.35rem 0 0;font-size:0.75rem;color:var(--muted);">
              [${fmtK(pMin)} — ${fmtK(pMax)}]
            </p>
          </div>
        </div>

        <!-- ④ Confiança do modelo -->
        <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
            <h4 style="margin:0;color:var(--text);font-size:0.95rem;">🎯 Confiança da Projeção</h4>
            <span style="font-size:0.78rem;color:var(--muted);">
              ${vizinhos.length || 1} vizinhos KNN · dia ${p.dia_atual}/${diasNoMes}
            </span>
          </div>
          ${confiancaBar(confianca)}
          <p style="margin:0.6rem 0 0;font-size:0.8rem;color:var(--muted);">
            ${confianca >= 75
              ? '✅ Alta confiança — dados acumulados suficientes para projeção sólida.'
              : confianca >= 50
              ? '⚡ Confiança moderada — aguarde mais dias para uma projeção mais precisa.'
              : '⚠️ Baixa confiança — início de mês com poucos dados. Interprete com cautela.'}
          </p>
        </div>

        <!-- ⑤ Gráfico -->
        <div class="panel" style="padding:1.5rem;border-radius:8px;background:var(--surface);">
          <h4 style="margin:0 0 1rem;color:var(--text);font-size:1.05rem;">
            📈 Curva de Sazonalidade & Burn Rate
          </h4>
          <div style="position:relative;height:300px;width:100%;">
            <canvas id="predictiveChart"></canvas>
          </div>
        </div>

        <!-- ⑥ Mês Gêmeo -->
        <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
            <h4 style="margin:0;color:var(--text);font-size:0.95rem;">
              🧠 Mês Gêmeo — KNN (K=${vizinhos.length || 1})
            </h4>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span style="font-size:0.8rem;color:var(--muted);">Melhor vizinho:</span>
              <span style="font-size:0.85rem;font-weight:700;padding:3px 12px;border-radius:20px;
                            background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.3);
                            color:#facc15;">${p.twin_month}</span>
              ${similaridade > 0 ? `<span style="font-size:0.8rem;font-weight:700;color:#facc15;">${similaridade}% sim.</span>` : ''}
            </div>
          </div>
          <p style="margin:0 0 0.75rem;font-size:0.83rem;color:var(--muted);line-height:1.5;">
            O modelo identificou os meses históricos mais parecidos com o comportamento atual
            (dia ${p.dia_atual}, R$ ${fmtK(p.gasto_atual)} acumulados, ${p.volume_ordens_atual} ordens).
            A projeção é uma <strong>média ponderada</strong> dos vizinhos pelo inverso da distância.
          </p>
          ${vizinhosHtml}
        </div>

        <!-- ⑦ Alertas de Anomalia -->
        <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
          <h4 style="margin:0 0 0.85rem;color:var(--text);font-size:0.95rem;">
            🚨 Alertas de Anomalia (últimos 7 dias)
          </h4>
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${alertsHtml}
          </div>
        </div>

        <!-- ⑧ Status rodapé -->
        <div class="panel" style="padding:1rem 1.4rem;border-radius:8px;background:var(--surface);
                                  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <p style="color:var(--muted);font-size:0.82rem;margin:0;">
            ⚙️ Modelo atualizado automaticamente via GitHub Actions (03h UTC diário).
          </p>
          <p style="color:${frescor.cor};font-size:0.82rem;margin:0;font-weight:600;">
            ${frescor.icone} ${new Date(p.atualizado_em).toLocaleString('pt-BR')} (${horasAgo})
          </p>
        </div>

      </div>
    `;

    container.innerHTML = html;

    // ── gráfico ───────────────────────────────────────────────────────────
    if (p.historico_dias && p.historico_dias.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('predictiveChart')?.getContext('2d');
        if (!ctx) return;

        let cumulativeReal = 0;
        const labels        = [];
        const dataReal      = [];
        const dataProjected = [];
        const dataBandMin   = [];
        const dataBandMax   = [];

        const ultimoDia     = p.dia_atual;
        const projecaoFinal = p.projecao_final;

        let maxDia = ultimoDia;
        p.historico_dias.forEach(d => { if (d.dia > maxDia) maxDia = d.dia; });

        for (let i = 1; i <= maxDia; i++) {
          labels.push(`Dia ${i}`);
          const d = p.historico_dias.find(x => x.dia === i);

          if (!d || !d.is_projecao) {
            if (d) cumulativeReal += d.gasto_diario;
            dataReal.push(cumulativeReal);
            dataProjected.push(null);
            dataBandMin.push(null);
            dataBandMax.push(null);
          } else {
            dataReal.push(null);
            const frac = d.fracao_sazonal;
            dataProjected.push(projecaoFinal * frac);
            dataBandMin.push(pMin * frac);
            dataBandMax.push(pMax * frac);
          }
        }

        // conectar no último ponto real
        if (ultimoDia > 0 && ultimoDia <= maxDia) {
          dataProjected[ultimoDia - 1] = dataReal[ultimoDia - 1];
          dataBandMin[ultimoDia - 1]   = dataReal[ultimoDia - 1];
          dataBandMax[ultimoDia - 1]   = dataReal[ultimoDia - 1];
        }

        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Consumo Real (Acumulado)',
                data: dataReal,
                borderColor: '#3cff78',
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                pointRadius: 2,
                tension: 0.2,
                order: 1
              },
              {
                label: 'Projeção KNN (Ponderada)',
                data: dataProjected,
                borderColor: 'rgba(255,215,0,0.9)',
                backgroundColor: 'rgba(255,215,0,0.07)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.3,
                order: 2
              },
              {
                label: 'Banda Máxima',
                data: dataBandMax,
                borderColor: 'rgba(255,120,60,0.35)',
                backgroundColor: 'rgba(255,120,60,0.05)',
                borderWidth: 1,
                borderDash: [3, 4],
                pointRadius: 0,
                fill: '+1',
                tension: 0.3,
                order: 3
              },
              {
                label: 'Banda Mínima',
                data: dataBandMin,
                borderColor: 'rgba(60,255,120,0.25)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [3, 4],
                pointRadius: 0,
                fill: false,
                tension: 0.3,
                order: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                labels: {
                  color: '#ccc',
                  filter: (item) => !item.text.includes('Banda')
                }
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    if (ctx.raw == null) return null;
                    return ctx.dataset.label + ': R$ ' + fmt(ctx.raw);
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: '#888', maxTicksLimit: 10 },
                grid: { color: 'rgba(255,255,255,0.04)' }
              },
              y: {
                ticks: { color: '#888', callback: (v) => 'R$ ' + fmtK(v) },
                grid: { color: 'rgba(255,255,255,0.04)' }
              }
            }
          }
        });
      }, 100);
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:#ff3c3c;">Erro ao carregar dados preditivos da nuvem.</p>';
  }
}
