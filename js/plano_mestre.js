import { getClient } from './db.js';
import { toast, confirmar } from './ui.js';

let dataMaquinas = [];
let dataAtividades = [];

// Estado dos filtros
let filterText = '';
let filterDisciplina = '';
let filterEstrategia = '';
let chartEstrategia = null;

export async function initPlanoMestre() {
  const container = document.getElementById('view-plano-mestre');
  if (!container) return;

  // Refresh global window trigger for when import completes
  window.atualizarPlanoMestreGlobal = async () => {
    await carregarDados();
    render();
  };

  // Bind Events para Filtros
  document.getElementById('pm-search')?.addEventListener('input', (e) => {
    filterText = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('pm-filter-disciplina')?.addEventListener('change', (e) => {
    filterDisciplina = e.target.value;
    render();
  });
  document.getElementById('pm-filter-estrategia')?.addEventListener('change', (e) => {
    filterEstrategia = e.target.value;
    render();
  });

  // Bind Modal Events
  document.getElementById('btnFecharModalAtividadePM')?.addEventListener('click', fecharModalEditarAtividade);
  document.getElementById('btnCancelarModalAtividadePM')?.addEventListener('click', fecharModalEditarAtividade);
  document.getElementById('btnSalvarAtividadePM')?.addEventListener('click', salvarEdicaoAtividade);

  // Bind Export
  document.getElementById('btnExportPlanoMestre')?.addEventListener('click', exportarExcelPlanoMestre);
  document.getElementById('btnExportPlanoMestrePDF')?.addEventListener('click', () => {
    import('./pdf_report.js?v=9').then(m => {
      if (m.gerarChecklistPlanoMestrePDF) {
        m.gerarChecklistPlanoMestrePDF(getAtividadesFiltradas(), dataMaquinas);
      }
    });
  });
  await carregarDados();
  atualizarSelectEstrategias();
  render();
}

async function carregarDados() {
  try {
    const supabase = getClient();
    const { data: maquinas, error: errMaq } = await supabase.from('plano_mestre_maquinas').select('*');
    if (errMaq) throw errMaq;
    
    const { data: atividades, error: errAtv } = await supabase.from('plano_mestre_atividades').select('*');
    if (errAtv) throw errAtv;

    dataMaquinas = maquinas || [];
    dataAtividades = atividades || [];
    window._dataMaquinas = dataMaquinas;
    window._dataAtividades = dataAtividades;
  } catch (error) {
    console.error('Erro ao carregar dados do plano mestre:', error);
    toast('Erro ao carregar plano mestre.', 'error');
  }
}

function atualizarSelectEstrategias() {
  const select = document.getElementById('pm-filter-estrategia');
  if (!select) return;
  const setEstrategias = new Set(dataAtividades.map(a => a.estrategia).filter(e => e && e.trim() !== ''));
  const optionsHTML = ['<option value="">Todas Estratégias</option>'];
  Array.from(setEstrategias).sort().forEach(est => {
    optionsHTML.push(`<option value="${est}">${est}</option>`);
  });
  select.innerHTML = optionsHTML.join('');
}

function getAtividadesFiltradas() {
  return dataAtividades.filter(atv => {
    const maq = dataMaquinas.find(m => m.id === atv.maquina_id);
    if (!maq) return false;

    // Filtro Disciplina
    if (filterDisciplina && maq.disciplina !== filterDisciplina) return false;

    // Filtro Estrategia
    if (filterEstrategia && atv.estrategia !== filterEstrategia) return false;

    // Filtro Texto (Tag, Maquina, Componente, Ação)
    if (filterText) {
      const matchTag = maq.tag.toLowerCase().includes(filterText);
      const matchMaq = maq.nome_maquina.toLowerCase().includes(filterText);
      const matchHier = atv.hierarquia_sistema.toLowerCase().includes(filterText);
      const matchAcao = atv.o_que_fazer.toLowerCase().includes(filterText);
      if (!matchTag && !matchMaq && !matchHier && !matchAcao) return false;
    }

    return true;
  });
}

function renderDashboards(atividadesFiltradas) {
  const maquinasAtivas = new Set(atividadesFiltradas.map(a => a.maquina_id)).size;
  const totalHH = atividadesFiltradas.reduce((sum, a) => sum + (a.hh || 0), 0);

  document.getElementById('pm-total-atividades').innerText = atividadesFiltradas.length;
  document.getElementById('pm-total-hh').innerText = totalHH.toFixed(2);
  document.getElementById('pm-total-maquinas').innerText = maquinasAtivas;

  // Chart
  const ctx = document.getElementById('pmChartEstrategia');
  if (ctx && window.Chart) {
    const estrategias = {};
    atividadesFiltradas.forEach(a => {
      const e = a.estrategia || 'N/D';
      estrategias[e] = (estrategias[e] || 0) + 1;
    });

    const labels = Object.keys(estrategias);
    const values = Object.values(estrategias);

    if (chartEstrategia) {
      chartEstrategia.data.labels = labels;
      chartEstrategia.data.datasets[0].data = values;
      chartEstrategia.update();
    } else {
      chartEstrategia = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: ['#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#facc15'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '70%'
        }
      });
    }
  }
}

function render() {
  const container = document.getElementById('planoMestreContent');
  if (!container) return;

  if (dataMaquinas.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 3rem; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px;">
        <h4 style="color: var(--text);">Nenhuma máquina cadastrada no Plano Mestre</h4>
        <p>Importe a planilha base para começar a gerenciar.</p>
      </div>`;
    return;
  }

  const atividadesFiltradas = getAtividadesFiltradas();
  renderDashboards(atividadesFiltradas);

  let html = `<div style="display: flex; flex-direction: column; gap: 1.5rem;">`;
  
  // Agrupar por máquina apenas as máquinas que têm atividades no filtro
  dataMaquinas.forEach(maq => {
    const atvsMaq = atividadesFiltradas.filter(a => a.maquina_id === maq.id);
    
    if (atvsMaq.length === 0) return;
    
    html += `
      <div class="panel-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; transition: all 0.3s;">
        <div style="padding: 1rem 1.5rem; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="margin: 0; color: var(--primary); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
               <span class="icon">${maq.disciplina === 'ELÉTRICA' ? '⚡' : '⚙️'}</span>
               ${maq.tag} - ${maq.nome_maquina}
            </h4>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem;">${maq.disciplina} | Linha: ${maq.linha || '-'}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div class="badge badge-info">${atvsMaq.length} Atividades</div>
            <button class="btn btn-danger btn-sm" onclick="window.excluirMaquinaPM('${maq.id}')" title="Excluir Máquina Inteira">🗑️</button>
          </div>
        </div>
        <div style="padding: 0; max-height: 500px; overflow-y: auto;">
          <table class="table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead style="position: sticky; top: 0; background: #1b263b; z-index: 1;">
              <tr>
                <th style="padding: 0.8rem 1.5rem; text-align: left; width: 35%;">Sistema / Componente</th>
                <th style="padding: 0.8rem 1rem; text-align: left; width: 25%;">Ação Preventiva</th>
                <th style="padding: 0.8rem 1rem; text-align: center; width: 10%;">Estratégia</th>
                <th style="padding: 0.8rem 1rem; text-align: center; width: 8%;">H-H</th>
                <th style="padding: 0.8rem 1rem; text-align: center; width: 12%;">Frequência</th>
              </tr>
            </thead>
            <tbody>
    `;

    atvsMaq.forEach(atv => {
      const parts = atv.hierarquia_sistema.split(' > ');
      const componente = parts.pop();
      const path = parts.join(' > ');

      html += `
        <tr class="table-row-hover" style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; cursor: pointer;" onclick="window.abrirDetalhesPlanoMestre('${atv.id}')">
          <td style="padding: 0.8rem 1.5rem;">
            <div style="color: var(--muted); font-size: 0.75rem; margin-bottom: 0.2rem;">${path}</div>
            <div style="color: var(--text); font-weight: 500;">${componente}</div>
          </td>
          <td style="padding: 0.8rem 1rem; color: var(--text);">
             ${atv.o_que_fazer}
             ${atv.material ? `<div style="font-size: 0.75rem; color: var(--muted); margin-top:0.3rem;">📦 ${atv.material}</div>` : ''}
          </td>
          <td style="padding: 0.8rem 1rem; text-align: center;">
             <span class="badge" style="background: rgba(255,255,255,0.1);">${atv.estrategia || '-'}</span>
          </td>
          <td style="padding: 0.8rem 1rem; text-align: center; color: var(--muted);">${atv.hh ? atv.hh.toFixed(2) : '-'}</td>
          <td style="padding: 0.8rem 1rem; text-align: center;">
             <strong style="color: var(--secondary);">${atv.frequencia || '-'}</strong>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  container.innerHTML = html;
}

// ------------------------------------------------------------------
// LÓGICA DE CRUD
// ------------------------------------------------------------------
window.abrirDetalhesPlanoMestre = (idAtv) => {
  const atv = dataAtividades.find(a => a.id === idAtv);
  if (!atv) return;
  const maq = dataMaquinas.find(m => m.id === atv.maquina_id);
  
  // Mix in machine name for the drilldown
  const atvView = { ...atv, maquina_nome: maq ? maq.nome_maquina : '' };

  if (window.abrirDrilldown) {
    window.abrirDrilldown({
      titulo: maq ? maq.tag : 'Atividade',
      subtitulo: maq ? maq.nome_maquina : '',
      registros: [atvView],
      meta: { isPlanoMestre: true }
    });
  } else {
    toast('Função de drilldown não encontrada.', 'warning');
  }
};

window.excluirMaquinaPM = async (idMaquina) => {
  if (!confirmar('ATENÇÃO: Deseja realmente apagar esta MÁQUINA e todas as suas atividades? Esta ação não pode ser desfeita.')) return;
  
  try {
    const supabase = getClient();
    toast('Excluindo...', 'info');
    const { error } = await supabase.from('plano_mestre_maquinas').delete().eq('id', idMaquina);
    if (error) throw error;
    
    toast('Máquina excluída com sucesso!', 'success');
    await carregarDados();
    render();
  } catch (err) {
    console.error(err);
    toast('Erro ao excluir: ' + err.message, 'error');
  }
};

window.excluirAtividadePM = async (idAtividade) => {
  if (!confirmar('Deseja excluir esta atividade específica?')) return;
  try {
    const supabase = getClient();
    toast('Excluindo...', 'info');
    const { error } = await supabase.from('plano_mestre_atividades').delete().eq('id', idAtividade);
    if (error) throw error;
    
    toast('Atividade excluída!', 'success');
    await carregarDados();
    atualizarSelectEstrategias();
    render();
  } catch (err) {
    console.error(err);
    toast('Erro ao excluir: ' + err.message, 'error');
  }
};

window.abrirModalEditarAtividadePM = (idAtividade) => {
  const atv = dataAtividades.find(a => String(a.id) === String(idAtividade));
  if (!atv) return;

  document.getElementById('pm_atividade_id').value = atv.id;
  document.getElementById('pm_atividade_hierarquia').value = atv.hierarquia_sistema;
  document.getElementById('pm_atividade_acao').value = atv.o_que_fazer;
  document.getElementById('pm_atividade_estrategia').value = atv.estrategia || '';
  document.getElementById('pm_atividade_frequencia').value = atv.frequencia || '';
  document.getElementById('pm_atividade_hh').value = atv.hh || '';
  document.getElementById('pm_atividade_material').value = atv.material || '';

  document.getElementById('modalEditarAtividadePM').classList.add('open');
};

function fecharModalEditarAtividade() {
  document.getElementById('modalEditarAtividadePM').classList.remove('open');
}

async function salvarEdicaoAtividade() {
  const id = document.getElementById('pm_atividade_id').value;
  const o_que_fazer = document.getElementById('pm_atividade_acao').value;
  const estrategia = document.getElementById('pm_atividade_estrategia').value;
  const frequencia = document.getElementById('pm_atividade_frequencia').value;
  const hh_val = document.getElementById('pm_atividade_hh').value;
  const material = document.getElementById('pm_atividade_material').value;

  try {
    const supabase = getClient();
    document.getElementById('btnSalvarAtividadePM').disabled = true;
    document.getElementById('btnSalvarAtividadePM').innerText = 'Salvando...';

    const updates = {
      o_que_fazer,
      estrategia,
      frequencia,
      hh: hh_val ? parseFloat(hh_val) : null,
      material
    };

    const { error } = await supabase.from('plano_mestre_atividades').update(updates).eq('id', id);
    if (error) throw error;

    toast('Atividade atualizada com sucesso!', 'success');
    fecharModalEditarAtividade();
    await carregarDados();
    atualizarSelectEstrategias();
    render();
  } catch (err) {
    console.error(err);
    toast('Erro ao atualizar: ' + err.message, 'error');
  } finally {
    document.getElementById('btnSalvarAtividadePM').disabled = false;
    document.getElementById('btnSalvarAtividadePM').innerText = 'Salvar Alterações';
  }
}

// ------------------------------------------------------------------
// EXPORTAÇÃO EXCEL
// ------------------------------------------------------------------
function exportarExcelPlanoMestre() {
  const atividadesFiltradas = getAtividadesFiltradas();
  if (atividadesFiltradas.length === 0) {
    toast('Nenhum dado para exportar.', 'warning');
    return;
  }

  // Achatando os dados para a planilha
  const dadosExcel = atividadesFiltradas.map(atv => {
    const maq = dataMaquinas.find(m => m.id === atv.maquina_id);
    return {
      'TAG': maq?.tag || '-',
      'NOME DA MÁQUINA': maq?.nome_maquina || '-',
      'DISCIPLINA': maq?.disciplina || '-',
      'SISTEMA / COMPONENTE': atv.hierarquia_sistema,
      'O QUE FAZER?': atv.o_que_fazer,
      'ESTRATÉGIA': atv.estrategia,
      'FREQUÊNCIA': atv.frequencia,
      'MATERIAL': atv.material,
      'H-H': atv.hh || 0
    };
  });

  const ws = window.XLSX.utils.json_to_sheet(dadosExcel);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Plano_Mestre");

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  window.XLSX.writeFile(wb, `Plano_Mestre_${dateStr}.xlsx`);
}
