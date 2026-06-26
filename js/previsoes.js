// js/previsoes.js
import { getClient } from './db.js?v=45';

export async function renderPrevisoes() {
  const container = document.getElementById('previsoes-container');
  if (!container) return;

  container.innerHTML = '<p style="color: #888;">Carregando modelo preditivo da nuvem...</p>';

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .single();

    if (error) throw error;

    const mockPrediction = JSON.parse(data.descricao_codigo);
    const isOverrun = mockPrediction.overrun > 0;
    
    const html = `
      <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 900px; margin: 0 auto; width: 100%;">
        
        <!-- Alerta Preditivo -->
        <div style="padding: 1.5rem; border-radius: 8px; background: ${isOverrun ? 'rgba(255, 60, 60, 0.1)' : 'rgba(60, 255, 120, 0.1)'}; border: 1px solid ${isOverrun ? '#ff3c3c' : '#3cff78'};">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 2rem;">${isOverrun ? '⚠️' : '✅'}</div>
            <div>
              <h3 style="margin: 0; color: ${isOverrun ? '#ff3c3c' : '#3cff78'}; font-size: 1.25rem;">
                ${isOverrun ? 'Risco de Estouro de Budget' : 'Budget Saudável'}
              </h3>
              <p style="margin: 0.5rem 0 0 0; color: var(--text); font-size: 0.95rem;">
                No ritmo atual (dia ${mockPrediction.dia_atual}), a previsão matemática da nuvem projeta que fecharemos o mês gastando 
                <strong>R$ ${mockPrediction.projecao_final.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong>. 
                Isso representa um ${isOverrun ? 'estouro' : 'saldo'} de <strong>R$ ${Math.abs(mockPrediction.overrun).toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong> em relação ao target de R$ ${mockPrediction.budget.toLocaleString('pt-BR', {minimumFractionDigits:2})}.
              </p>
            </div>
          </div>
        </div>

        <!-- Métricas -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Gasto Atual (Dia ${mockPrediction.dia_atual})</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: var(--text);">R$ ${mockPrediction.gasto_atual.toLocaleString('pt-BR')}</p>
          </div>
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Budget Mensal</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: var(--gold);">R$ ${mockPrediction.budget.toLocaleString('pt-BR')}</p>
          </div>
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface); border: 1px solid ${isOverrun ? '#ff3c3c' : 'transparent'};">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Projeção de Fechamento</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: ${isOverrun ? '#ff3c3c' : 'var(--text)'};">R$ ${mockPrediction.projecao_final.toLocaleString('pt-BR')}</p>
          </div>
        </div>

        <!-- Informação do Modelo -->
        <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
          <h4 style="margin: 0 0 1rem 0; color: var(--text); font-size: 1.1rem;">Status do Modelo Automático</h4>
          <p style="color: var(--muted); font-size: 0.95rem; margin: 0;">O modelo roda automaticamente nas madrugadas (via GitHub Actions).</p>
          <p style="color: var(--gold); font-size: 0.85rem; margin-top: 0.5rem;">Último treinamento/cálculo: ${new Date(mockPrediction.atualizado_em).toLocaleString('pt-BR')}</p>
        </div>

      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color: #ff3c3c;">Erro ao carregar dados preditivos da nuvem.</p>';
  }
}
