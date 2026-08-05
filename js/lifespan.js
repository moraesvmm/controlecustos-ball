function initLifespan() {
  const viewLifespan = document.getElementById('view-lifespan');
  const btnNovoLifespan = document.getElementById('btnNovoLifespan');
  const lifespanGrid = document.getElementById('lifespanGrid');
  const lifespanAlertBanner = document.getElementById('lifespanAlertBanner');
  const lifespanAlertText = document.getElementById('lifespanAlertText');

  const filterLinha = document.getElementById('lifespanFilterLinha');
  const filterStatus = document.getElementById('lifespanFilterStatus');
  const filterSearch = document.getElementById('lifespanSearch');

  // Modals
  const modalNovo = document.getElementById('modalLifespanNovo');
  const formNovo = document.getElementById('formLifespanNovo');
  const btnFecharNovo = document.getElementById('btnFecharModalLifespanNovo');

  const modalTroca = document.getElementById('modalLifespanTroca');
  const formTroca = document.getElementById('formLifespanTroca');
  const btnFecharTroca = document.getElementById('btnFecharModalLifespanTroca');

  let activeComponents = [];
  
  // UI State for Master-Detail
  let currentLinha = 'Linha 4';
  let currentMaquina = '';

  const maquinasPadrao = [
    'Prensa', 'Verniz Interno', 'Acumulador 1', 'Acumulador 2', 
    'Acumulador 3', 'Verniz Externo', 'Lavadora', 'Impressora', 
    'Esmaltadeira', 'Conificadora', 'Tamboreador'
  ];

  const maquinasPorLinha = {
    'Linha 4': maquinasPadrao,
    'Linha 5': maquinasPadrao,
    'Linha 6': maquinasPadrao,
    'Linha 7': maquinasPadrao,
    'Linha 8': maquinasPadrao,
    'Linha 8': maquinasPadrao,
    'Linha 9': maquinasPadrao
  };

  function atualizarDataSyncUI() {
    const el = document.getElementById('lifespanSyncDate');
    if (!el) return;
    const dateStr = localStorage.getItem('last_lifespan_sync');
    if (dateStr) {
      const d = new Date(dateStr);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      el.textContent = `Última Sync: ${dia}/${mes}/${ano} ${hh}:${mm}`;
      el.style.color = 'var(--gold)';
    } else {
      el.textContent = `Última Sync: Pendente`;
      el.style.color = 'var(--danger)';
    }
  }

  // API Calls
  async function fetchLifespanComponents() {
    try {
      const res = await fetch('/api/lifespan/components');
      if (res.ok) {
        activeComponents = await res.json();
        renderLifespanGrid();
        const bar = document.getElementById('rowActionBarLifespan');
        if (bar) bar.style.display = 'none';
      }
    } catch (e) {
      console.error("Erro ao buscar componentes Lifespan", e);
    }
  }
  function renderLifespanGrid() {
    let criticalCount = 0;

    // Filters
    const valStatus = filterStatus ? filterStatus.value : 'ALL';
    const valSearch = (filterSearch ? filterSearch.value : '').toLowerCase();

    const linhasPadrao = ['Linha 4', 'Linha 5', 'Linha 6', 'Linha 7', 'Linha 8', 'Linha 9'];

    // Filtra rigidamente os componentes ativos para apenas as linhas permitidas
    activeComponents = activeComponents.filter(c => linhasPadrao.includes(c.linha));

    let filtered = activeComponents.filter(c => {
      if (valStatus !== 'ALL' && c.cor_status !== valStatus) return false;
      if (valSearch) {
        if (!c.nome_componente.toLowerCase().includes(valSearch) && 
            !c.maquina.toLowerCase().includes(valSearch) &&
            !(c.codigo_componente && c.codigo_componente.toLowerCase().includes(valSearch))) return false;
      }
      return true;
    });

    activeComponents.forEach(c => {
      if (c.cor_status === 'VERMELHO') criticalCount++;
    });

    if (criticalCount > 0) {
      if (lifespanAlertText) lifespanAlertText.textContent = `${criticalCount} componente(s) em estado crítico!`;
      if (lifespanAlertBanner) lifespanAlertBanner.style.display = 'flex';
    } else {
      if (lifespanAlertBanner) lifespanAlertBanner.style.display = 'none';
    }

    // Grouping
    const grupos = {};
    linhasPadrao.forEach(l => {
      grupos[l] = {};
      maquinasPadrao.forEach(m => grupos[l][m] = []); // Pre-fill with standard machines
    });
    
    filtered.forEach(comp => {
      if (!grupos[comp.linha]) return;
      if (!grupos[comp.linha][comp.maquina]) grupos[comp.linha][comp.maquina] = [];
      grupos[comp.linha][comp.maquina].push(comp);
    });

    // 1. Render Tabs for Linhas
    const tabsContainer = document.getElementById('lifespanLinhasTabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      linhasPadrao.forEach(linha => {
        const isActive = (linha === currentLinha);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = linha;
        btn.className = isActive ? 'btn btn-primary' : 'btn btn-ghost';
        btn.style.padding = '0.4rem 1rem';
        btn.style.borderRadius = '20px';
        btn.style.fontSize = '0.85rem';
        
        // Count total and critical in this line to show subtle badge
        const linhaComps = activeComponents.filter(c => c.linha === linha); // base array not filtered by search
        const criticalInLine = linhaComps.filter(c => c.cor_status === 'VERMELHO').length;
        if (criticalInLine > 0) {
          btn.innerHTML += ` <span style="background:var(--danger); color:white; padding:1px 6px; border-radius:10px; font-size:0.65rem; margin-left:4px;">${criticalInLine}</span>`;
        }

        btn.addEventListener('click', () => {
          currentLinha = linha;
          currentMaquina = ''; // reset machine on line change
          renderLifespanGrid();
        });
        tabsContainer.appendChild(btn);
      });
    }

    // 2. Render Sidebar Maquinas
    const maquinasList = document.getElementById('lifespanMaquinasList');
    if (maquinasList) {
      maquinasList.innerHTML = '';
      const maquinas = Object.keys(grupos[currentLinha] || {}).sort();
      
      if (maquinas.length === 0) {
        maquinasList.innerHTML = `<div style="padding: 1rem; color: var(--muted); font-size: 0.8rem; font-style: italic; text-align: center;">Nenhuma máquina monitorada nesta linha.</div>`;
      } else {
        // Auto-select first machine if none selected
        if (!currentMaquina && maquinas.length > 0) {
          currentMaquina = maquinas[0];
        }

        maquinas.forEach(maquina => {
          const isSelected = (maquina === currentMaquina);
          const maquinaComps = grupos[currentLinha][maquina];
          const hasCritical = maquinaComps.some(c => c.cor_status === 'VERMELHO');

          const div = document.createElement('div');
          div.style.padding = '0.75rem 1rem';
          div.style.cursor = 'pointer';
          div.style.borderRadius = '8px';
          div.style.fontSize = '0.85rem';
          div.style.display = 'flex';
          div.style.justifyContent = 'space-between';
          div.style.alignItems = 'center';
          div.style.transition = 'background 0.2s';
          
          if (isSelected) {
            div.style.background = 'rgba(212,175,55,0.15)'; // gold tint
            div.style.border = '1px solid rgba(212,175,55,0.3)';
            div.style.color = 'var(--text)';
            div.style.fontWeight = '500';
          } else {
            div.style.background = 'transparent';
            div.style.border = '1px solid transparent';
            div.style.color = 'var(--text-secondary)';
          }

          div.addEventListener('mouseover', () => { if(!isSelected) div.style.background = 'rgba(255,255,255,0.05)'; });
          div.addEventListener('mouseout', () => { if(!isSelected) div.style.background = 'transparent'; });
          
          div.addEventListener('click', () => {
            currentMaquina = maquina;
            renderLifespanGrid();
          });

          let dot = hasCritical ? `<span style="width:8px; height:8px; border-radius:50%; background:var(--danger); display:inline-block; margin-right:8px;"></span>` : 
                                  `<span style="width:8px; height:8px; border-radius:50%; background:var(--primary); display:inline-block; margin-right:8px; opacity:0.5;"></span>`;
          
          div.innerHTML = `
            <div style="display:flex; align-items:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${dot} ${maquina}
            </div>
            <span style="font-size:0.7rem; color:var(--muted); background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:10px;">${maquinaComps.length}</span>
          `;
          maquinasList.appendChild(div);
        });
      }
    }

    // 3. Render Table Content
    const titleEl = document.getElementById('lifespanSelectedMaquinaTitle');
    const kpisEl = document.getElementById('lifespanMaquinaKpis');
    const tbody = document.getElementById('lifespanTableBody');

    if (!titleEl || !tbody) return;

    if (!currentMaquina) {
      titleEl.innerHTML = `<span style="color:var(--muted)">Selecione uma máquina ao lado</span>`;
      kpisEl.innerHTML = '';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 3rem; color: var(--muted); font-style:italic;">Nenhum componente selecionado.</td></tr>`;
      if (document.getElementById('btnNovoLifespan')) document.getElementById('btnNovoLifespan').style.display = 'none';
      return;
    }

    if (document.getElementById('btnNovoLifespan')) document.getElementById('btnNovoLifespan').style.display = 'flex';
    titleEl.textContent = currentMaquina;

    const currentComps = grupos[currentLinha][currentMaquina] || [];
    
    // Calculate KPIs
    const mTotal = currentComps.length;
    const mVencidos = currentComps.filter(c => c.cor_status === 'VERMELHO').length;
    const mAtencao = currentComps.filter(c => c.cor_status === 'AMARELO').length;
    const mSaudaveis = currentComps.filter(c => c.cor_status === 'VERDE').length;
    
    kpisEl.innerHTML = `
      <div style="display:flex; gap:1rem; align-items:center; font-size:0.7rem; font-weight:500; letter-spacing:0.02em;">
        <span style="color:var(--text-secondary);">Total: ${mTotal}</span>
        <span style="display:flex; align-items:center; gap:4px; color:var(--muted);"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span> ${mSaudaveis}</span>
        <span style="display:flex; align-items:center; gap:4px; color:var(--muted);"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span> ${mAtencao}</span>
        <span style="display:flex; align-items:center; gap:4px; color:var(--muted);"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> ${mVencidos}</span>
      </div>
    `;

    tbody.innerHTML = '';

    if (currentComps.length === 0) {
       tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 3rem; color: var(--muted); font-style:italic;">Nenhum componente cadastrado nesta máquina.</td></tr>`;
    } else {
       currentComps.forEach(comp => {
          let colorHex = '#10b981'; 
          if (comp.cor_status === 'AMARELO') colorHex = '#f59e0b';
          if (comp.cor_status === 'VERMELHO') colorHex = '#ef4444';

          let percent = comp.percentual_uso > 100 ? 100 : comp.percentual_uso;
          let horasDisplay = comp.horas_restantes;
          let textLine1 = horasDisplay >= 0 ? `${horasDisplay}h` : `${Math.abs(horasDisplay)}h venc.`;
          let codigo = comp.codigo_componente || '-';

          const tr = document.createElement('tr');
          // Linear progress bar as background of the "Uso Real" cell
          const bgProgress = `<div style="position:absolute; top:0; left:0; height:100%; width:${percent}%; background:${colorHex}; opacity:0.1; z-index:0;"></div>`;
          
          let latasFmt = comp.latas_produzidas >= 1000000 ? (comp.latas_produzidas/1000000).toFixed(1) + 'M' : 
                         comp.latas_produzidas >= 1000 ? (comp.latas_produzidas/1000).toFixed(1) + 'K' : comp.latas_produzidas;

          tr.innerHTML = `
            <td style="text-align:center; position:relative;">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${colorHex}; box-shadow: 0 0 6px ${colorHex}80;"></span>
            </td>
            <td style="font-family: monospace; font-size:0.75rem;">${codigo}</td>
            <td>
              <div style="font-weight: 500; color:var(--text); font-size:0.85rem;">${comp.nome_componente}</div>
              <div style="font-size:0.65rem; color:var(--muted); opacity:0.75; margin-top:2px; letter-spacing:0.02em;">
                VOL: ${latasFmt} UN &nbsp;&bull;&nbsp; OP: ${comp.dias_corridos_produzidos} DIAS
              </div>
            </td>
            <td style="font-size:0.8rem;">${comp.vida_alvo_horas} h</td>
            <td style="position:relative; overflow:hidden; font-size:0.8rem;">
              ${bgProgress}
              <div style="position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center;">
                <span>${comp.horas_passadas} h</span>
                <span style="font-size:0.65rem; color:var(--muted);">${percent.toFixed(0)}%</span>
              </div>
            </td>
            <td style="text-align:right; color:${colorHex}; font-weight:600; font-size:0.8rem;">${textLine1}</td>
            <td style="text-align:center; vertical-align:middle;">
              <div style="display:flex; gap:0.5rem; justify-content:center; align-items:center; width:100%;">
                <button type="button" class="lifespan-btn-troca" data-id="${comp.id}" title="Registrar Troca" style="background:transparent; border:none; padding:0; margin:0; cursor:pointer; color:var(--gold); display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); outline:none;" onmouseover="this.style.background='rgba(212,175,55,0.15)'; this.style.transform='scale(1.15)';" onmouseout="this.style.background='transparent'; this.style.transform='scale(1)';">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                </button>
                <button type="button" class="lifespan-btn-delete" data-id="${comp.id}" title="Remover Componente" style="background:transparent; border:none; padding:0; margin:0; cursor:pointer; color:var(--muted); display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); outline:none;" onmouseover="this.style.color='var(--danger)'; this.style.background='rgba(239,68,68,0.1)'; this.style.transform='scale(1.15)';" onmouseout="this.style.color='var(--muted)'; this.style.background='transparent'; this.style.transform='scale(1)';">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          `;
          
          tr.addEventListener('dblclick', () => {
             abrirDrilldownLifespan(comp.id);
          });
          
          tr.addEventListener('click', (e) => {
             // Remove class 'selected' from all other tr
             document.querySelectorAll('#lifespanGrid tr').forEach(r => r.style.background = 'transparent');
             tr.style.background = 'rgba(212,175,55,0.05)';
             
             const bar = document.getElementById('rowActionBarLifespan');
             if(bar) {
                bar.style.display = 'flex';
                document.getElementById('actionBarLifespanTitle').textContent = comp.nome_componente + ' (' + (comp.codigo_componente || '-') + ')';
                
                // Unbind previous events using clone
                const btnDrill = document.getElementById('btnLifespanAcaoDrilldown');
                const btnTroca = document.getElementById('btnLifespanAcaoTroca');
                const btnDel = document.getElementById('btnLifespanAcaoDelete');
                
                const nDrill = btnDrill.cloneNode(true);
                const nTroca = btnTroca.cloneNode(true);
                const nDel = btnDel.cloneNode(true);
                
                btnDrill.replaceWith(nDrill);
                btnTroca.replaceWith(nTroca);
                btnDel.replaceWith(nDel);
                
                nDrill.addEventListener('click', () => abrirDrilldownLifespan(comp.id));
                nTroca.addEventListener('click', () => {
                   openModalTroca(comp.id);
                });
                nDel.addEventListener('click', async () => {
                   const userRole = window.currentUser?.user_metadata?.role || 'ADMIN';
                   if (userRole === 'LIFESPAN_ONLY') {
                     if(window.Swal) {
                       window.Swal.fire({
                         title: 'Acesso Negado',
                         text: 'Apenas administradores podem excluir componentes.',
                         icon: 'error',
                         confirmButtonColor: 'var(--gold)'
                       });
                     } else alert('Acesso Negado.');
                     return;
                   }
                   if(window.Swal) {
                     const res = await window.Swal.fire({
                       title: 'Remover Componente?',
                       text: "O componente sairá do monitoramento. O histórico será preservado.",
                       icon: 'warning',
                       showCancelButton: true,
                       confirmButtonColor: '#ef4444',
                       cancelButtonColor: '#374151',
                       confirmButtonText: 'Sim, remover'
                     });
                     if(res.isConfirmed) {
                       try {
                         const resp = await fetch('/api/lifespan/components/' + comp.id, { method: 'DELETE' });
                         if(resp.ok) {
                           window.Swal.fire('Removido!', '', 'success');
                           if(window.fetchLifespanComponents) window.fetchLifespanComponents();
                           bar.style.display = 'none';
                         }
                       } catch(e) {
                         console.error(e);
                       }
                     }
                   }
                });
             }
          });
          
          // Make tr look clickable
          tr.style.cursor = 'pointer';
          tr.style.transition = 'background 0.2s';
          tr.addEventListener('mouseover', () => { if(tr.style.background === 'transparent' || tr.style.background === '') tr.style.background = 'rgba(255,255,255,0.02)'; });
          tr.addEventListener('mouseout', () => { if(tr.style.background === 'rgba(255, 255, 255, 0.02)') tr.style.background = 'transparent'; });
          
          tbody.appendChild(tr);
       });
    }

    // Modal Logic for Drilldown
    window.abrirDrilldownLifespan = async function(id) {
        const comp = activeComponents.find(c => c.id === id);
        if (!comp) return;
        
        // Populate current data
        document.getElementById('modalDrilldownLifespanTitulo').textContent = comp.nome_componente;
        document.getElementById('modalDrilldownLifespanSub').textContent = `${comp.maquina} • ${comp.codigo_componente || 'Sem código'}`;
        
        let latasFmt = comp.latas_produzidas >= 1000000 ? (comp.latas_produzidas/1000000).toFixed(1) + 'M' : 
                       comp.latas_produzidas >= 1000 ? (comp.latas_produzidas/1000).toFixed(1) + 'K' : comp.latas_produzidas;
        
        document.getElementById('lifespanDrillVol').textContent = latasFmt + ' UN';
        document.getElementById('lifespanDrillDias').textContent = comp.dias_corridos_produzidos;
        
        document.getElementById('lifespanDrillReal').textContent = comp.horas_passadas + 'h';
        document.getElementById('lifespanDrillAlvo').textContent = comp.vida_alvo_horas + 'h';
        
        const pct = comp.vida_alvo_horas > 0 ? (comp.horas_passadas / comp.vida_alvo_horas) * 100 : 0;
        document.getElementById('lifespanDrillPct').textContent = pct.toFixed(1) + '%';
        document.getElementById('lifespanDrillBar').style.width = Math.min(pct, 100) + '%';
        
        let colorHex = '#22c55e';
        if (pct >= 100) colorHex = '#ef4444';
        else if (pct >= 85) colorHex = '#f97316';
        else if (pct >= 60) colorHex = '#eab308';
        
        document.getElementById('lifespanDrillBar').style.background = `linear-gradient(90deg, ${colorHex}, ${colorHex}dd)`;
        document.getElementById('lifespanDrillBar').style.boxShadow = `0 0 10px ${colorHex}50`;
        document.getElementById('lifespanDrillPct').style.color = colorHex;
        
        // Show modal
        document.getElementById('modalDrilldownLifespan').style.display = 'flex';
        
        // Fetch History
        const timeline = document.getElementById('lifespanDrillTimeline');
        timeline.innerHTML = `
          <div style="position: absolute; left: 15px; top: 10px; bottom: 10px; width: 2px; background: rgba(255,255,255,0.05); z-index: 0;"></div>
          <div style="text-align: center; padding: 2rem; color: var(--muted); font-size: 0.85rem;">Carregando histórico...</div>
        `;
        
        try {
            const url = `/api/lifespan/history?maquina=${encodeURIComponent(comp.maquina)}&linha=${encodeURIComponent(comp.linha)}&nome_componente=${encodeURIComponent(comp.nome_componente)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Falha ao carregar histórico');
            const history = await res.json();
            
            if (history.length === 0) {
               timeline.innerHTML = `
                  <div style="position: absolute; left: 15px; top: 10px; bottom: 10px; width: 2px; background: rgba(255,255,255,0.05); z-index: 0;"></div>
                  <div style="text-align: center; padding: 2rem; color: var(--muted); font-size: 0.85rem;">Nenhuma troca registrada para este componente.</div>
               `;
               return;
            }
            
            let html = '<div style="position: absolute; left: 15px; top: 10px; bottom: 10px; width: 2px; background: rgba(255,255,255,0.05); z-index: 0;"></div>';
            
            history.forEach(h => {
               const hpct = h.vida_alvo_horas > 0 ? (h.horas_passadas / h.vida_alvo_horas) * 100 : 0;
               let hColor = '#22c55e';
               if (hpct >= 100) hColor = '#ef4444';
               else if (hpct >= 85) hColor = '#f97316';
               else if (hpct >= 60) hColor = '#eab308';
               
               let hLatasFmt = h.latas_produzidas >= 1000000 ? (h.latas_produzidas/1000000).toFixed(1) + 'M' : 
                               h.latas_produzidas >= 1000 ? (h.latas_produzidas/1000).toFixed(1) + 'K' : h.latas_produzidas;
                               
               html += `
                  <div style="position: relative; z-index: 1; display: flex; gap: 1rem; align-items: flex-start;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.5); border: 2px solid ${hColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 0 10px ${hColor}30; margin-top: 4px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${hColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.25rem; border-radius: 12px; flex: 1; transition: background 0.2s; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;">
                         <div style="font-weight: 600; font-size: 0.95rem; color: var(--text);">${h.horas_passadas}h <span style="color:var(--muted); font-weight:400; font-size:0.85rem;">/ ${h.vida_alvo_horas}h</span></div>
                         <div style="font-size: 0.8rem; color: var(--muted);">Substituído em: ${String(h.data_remocao || '').slice(0, 10)}</div>
                      </div>
                      
                      <!-- Microinformação Minimalista Sem Contêiner (Dark Glass) -->
                      <div style="display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 0.75rem; font-family: 'Inter', sans-serif;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.6);">
                          <div style="width: 6px; height: 6px; border-radius: 50%; background: ${hColor}; box-shadow: 0 0 8px ${hColor};"></div>
                          Vida útil consumida: <span style="color: #fff; font-weight: 700; letter-spacing: 0.02em;">${hpct.toFixed(1)}%</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.6);">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                          Produção acumulada: <span style="color: #fff; font-weight: 700; letter-spacing: 0.02em;">${hLatasFmt} UN</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.6);">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                          Operação: <span style="color: #fff; font-weight: 700; letter-spacing: 0.02em;">${h.dias_corridos_produzidos} DIAS</span>
                        </div>
                      </div>
                      ${h.descricao_troca ? `<div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;"><strong>Nota:</strong> ${h.descricao_troca}</div>` : ''}
                      ${h.foto_url ? `<div style="margin-top: 1rem;"><a href="${h.foto_url}" target="_blank" style="display:inline-block; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);"><img src="${h.foto_url}" style="max-width: 100%; max-height: 200px; object-fit: cover; display: block;" alt="Foto da troca" /></a></div>` : ''}
                    </div>
                  </div>
               `;
            });
            timeline.innerHTML = html;
        } catch(e) {
            console.error(e);
            timeline.innerHTML = `
              <div style="position: absolute; left: 15px; top: 10px; bottom: 10px; width: 2px; background: rgba(255,255,255,0.05); z-index: 0;"></div>
              <div style="text-align: center; padding: 2rem; color: var(--danger); font-size: 0.85rem;">Erro ao carregar histórico.</div>
            `;
        }
    };

    // Re-bind events
    document.querySelectorAll('.lifespan-btn-troca').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        openModalTroca(id);
      });
    });

    document.querySelectorAll('.lifespan-btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userRole = window.currentUser?.user_metadata?.role || 'ADMIN';
        if (userRole === 'LIFESPAN_ONLY') {
          if(window.Swal) {
            window.Swal.fire({
              title: 'Acesso Negado',
              text: 'Apenas administradores podem excluir componentes.',
              icon: 'error',
              confirmButtonColor: 'var(--gold)'
            });
          } else alert('Acesso Negado.');
          return;
        }

        const id = parseInt(e.currentTarget.getAttribute('data-id'));
        if(window.Swal) {
          const res = await Swal.fire({
            title: 'Remover Componente?',
            text: "O componente sairá do monitoramento. O histórico será preservado.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--danger)',
            cancelButtonColor: 'transparent',
            confirmButtonText: 'Sim, remover',
            cancelButtonText: 'Cancelar',
            customClass: { popup: 'glass-swal', cancelButton: 'glass-swal-cancel' }
          });
          if (res.isConfirmed) {
            try {
              const response = await fetch(`/api/lifespan/components/${id}`, { method: 'DELETE' });
              if (response.ok) {
                fetchLifespanComponents();
                Swal.fire({title: 'Removido!', icon: 'success', timer: 1500, showConfirmButton: false});
              } else throw new Error('Erro ao remover');
            } catch (err) {
              Swal.fire('Erro', 'Não foi possível remover.', 'error');
            }
          }
        }
      });
    });
  }

  // Filter Listeners
  if (filterLinha) filterLinha.addEventListener('change', renderLifespanGrid);
  if (filterStatus) filterStatus.addEventListener('change', renderLifespanGrid);
  if (filterSearch) filterSearch.addEventListener('input', renderLifespanGrid);

  // --- Admin Factory Reset ---
  const btnReset = document.getElementById('btnResetLifespan');
  if (btnReset) {
    const userRole = window.currentUser?.user_metadata?.role || 'ADMIN';
    if (userRole === 'LIFESPAN_ONLY') {
      btnReset.style.display = 'none';
    } else {
      btnReset.style.display = 'flex';
    }

    btnReset.addEventListener('click', async () => {
      if(window.Swal) {
        const res = await Swal.fire({
          title: 'WIPE DATABASE?',
          html: "Esta ação é <b>irreversível</b>.<br>Todos os componentes ativos e o histórico serão apagados permanentemente da produção.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: 'var(--danger)',
          cancelButtonColor: 'transparent',
          confirmButtonText: 'Sim, Apagar Tudo',
          cancelButtonText: 'Cancelar',
          customClass: { popup: 'glass-swal', cancelButton: 'glass-swal-cancel' }
        });
        if (res.isConfirmed) {
          try {
            const response = await fetch('/api/lifespan/reset', { method: 'DELETE' });
            if (response.ok) {
              fetchLifespanComponents();
              Swal.fire({title: 'Resetado!', text: 'Banco de dados Lifespan limpo para produção.', icon: 'success', timer: 2000, showConfirmButton: false});
            } else throw new Error('Erro ao resetar');
          } catch (err) {
            Swal.fire('Erro', 'Não foi possível resetar o banco de dados.', 'error');
          }
        }
      }
    });
  }

  // --- Modal Logic ---
  if (btnNovoLifespan) {
    btnNovoLifespan.addEventListener('click', () => {
      if (!currentMaquina) {
        if(window.Swal) Swal.fire('Atenção', 'Selecione uma máquina na barra lateral primeiro para adicionar uma peça a ela.', 'warning');
        return;
      }
      document.getElementById('lifespanNovoLinha').value = currentLinha;
      document.getElementById('lifespanNovoMaquina').value = `${currentLinha} • ${currentMaquina}`;
      document.getElementById('lifespanNovoComponente').value = '';
      document.getElementById('lifespanNovoCodigo').value = '';
      document.getElementById('lifespanNovoAlvo').value = '';
      const dataInput = document.getElementById('lifespanNovoData');
      if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
      modalNovo.classList.add('open');
    });
  }
  if (btnFecharNovo) {
    btnFecharNovo.addEventListener('click', () => {
      modalNovo.classList.remove('open');
    });
  }

  function levenshtein(a, b) {
    if(a.length === 0) return b.length; 
    if(b.length === 0) return a.length; 
    var matrix = [];
    for(let i = 0; i <= b.length; i++){ matrix[i] = [i]; }
    for(let j = 0; j <= a.length; j++){ matrix[0][j] = j; }
    for(let i = 1; i <= b.length; i++){
      for(let j = 1; j <= a.length; j++){
        if(b.charAt(i-1) == a.charAt(j-1)){
          matrix[i][j] = matrix[i-1][j-1];
        } else {
          matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
        }
      }
    }
    return matrix[b.length][a.length];
  }
  
  function getSimilarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - levenshtein(longer, shorter)) / parseFloat(longerLength);
  }

  if (formNovo) {
    formNovo.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const linha = currentLinha;
      const maquina = currentMaquina; 
      const componente = document.getElementById('lifespanNovoComponente').value.trim();
      const codigoInput = document.getElementById('lifespanNovoCodigo');
      let codigo = codigoInput ? codigoInput.value.trim() : null;
      
      if (!codigo) {
        codigo = 'LV' + Math.floor(10000 + Math.random() * 90000);
      }
      
      // BLOQUEIO DE CLONES (Componente já existente na máquina)
      const isDuplicate = activeComponents.some(c => 
        c.linha === linha && 
        c.maquina === maquina && 
        (c.nome_componente.toLowerCase() === componente.toLowerCase() || 
         (codigo && c.codigo_componente && c.codigo_componente.toLowerCase() === codigo.toLowerCase()))
      );

      if (isDuplicate) {
        if(window.Swal) {
          Swal.fire({
             title: 'Componente Duplicado', 
             text: 'Esta peça já está rodando nesta máquina! Utilize o botão "Registrar Troca".', 
             icon: 'warning'
          });
        } else {
          alert("⚠️ ATENÇÃO: Este componente já está cadastrado e rodando nesta máquina!\n\nPara substituí-lo, feche este modal e clique no botão '🔄 Registrar Troca'.");
        }
        return; // Block submission
      }

      // FUZZY MATCHING (Prevenir erros de digitação e clones disfarçados)
      const sameMachineComps = activeComponents.filter(c => c.linha === linha && c.maquina === maquina);
      let fuzzyMatch = null;
      for (let c of sameMachineComps) {
        const sim = getSimilarity(c.nome_componente.toLowerCase(), componente.toLowerCase());
        if (sim >= 0.85) {
          fuzzyMatch = c;
          break;
        }
      }

      if (fuzzyMatch) {
        if (window.Swal) {
          const res = await Swal.fire({
            title: 'Possível Duplicidade',
            html: `Encontramos um componente muito parecido nesta máquina:<br><br><b style="color:var(--gold)">${fuzzyMatch.nome_componente}</b><br><br>Tem certeza que deseja criar um novo chamado <b>${componente}</b> em vez de registrar a troca do existente?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: 'var(--danger)',
            cancelButtonColor: 'var(--border)',
            confirmButtonText: 'Sim, criar novo',
            cancelButtonText: 'Não, cancelar'
          });
          if (!res.isConfirmed) return;
        } else {
          const conf = confirm(`Encontramos um componente muito parecido nesta máquina: ${fuzzyMatch.nome_componente}.\nTem certeza que deseja criar um novo em vez de registrar a troca do existente?`);
          if (!conf) return;
        }
      }

      const payload = {
        linha: linha,
        maquina: maquina,
        nome_componente: componente,
        codigo_componente: codigo,
        vida_alvo_horas: parseInt(document.getElementById('lifespanNovoAlvo').value),
        data_instalacao: document.getElementById('lifespanNovoData').value || null
      };

      try {
        const btnSave = document.getElementById('btnSalvarLifespanNovo');
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.textContent = 'Salvando...';
        }

        const res = await fetch('/api/lifespan/components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          modalNovo.classList.remove('open');
          fetchLifespanComponents();
          if(window.Swal) Swal.fire({title:'Sucesso', text:'Monitoramento iniciado!', icon:'success', timer:2000, showConfirmButton:false});
        } else {
          throw new Error('Falha no servidor');
        }
      } catch(err) {
        console.error(err);
        if(window.Swal) Swal.fire('Erro', 'Não foi possível salvar', 'error');
      } finally {
        const btnSave = document.getElementById('btnSalvarLifespanNovo');
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = 'Iniciar Monitoramento';
        }
      }
    });
  }

  // Troca de Componente
  function openModalTroca(id) {
    const comp = activeComponents.find(c => c.id === id);
    if (!comp) return;

    document.getElementById('lifespanTrocaId').value = comp.id;
    document.getElementById('lifespanTrocaMaquina').value = `${comp.linha} • ${comp.maquina}`;
    document.getElementById('lifespanTrocaComponente').value = comp.nome_componente;
    
    // ============================================================================
    // ALGORITMO PREDITIVO DE AUTO-CALIBRAÇÃO MTBF (Mean Time Between Failures)
    // ============================================================================
    // Utilizamos uma Média Móvel Exponencial (EMA - Exponential Moving Average)
    // para reajustar o alvo de vida útil de uma peça toda vez que ela é trocada.
    // 
    // Fórmula: Novo Alvo = (Alvo Antigo * 0.70) + (Horas Reais Sobrevividas * 0.30)
    // 
    // Racional Técnico e de Negócio:
    // - 70% de peso (Inércia Histórica): Evita que uma quebra acidental atípica 
    //   derrube o alvo de uma peça que historicamente costuma durar bastante.
    // - 30% de peso (Realidade Recente): Garante que o sistema aprenda gradativamente
    //   se o lote atual de peças do fornecedor possui qualidade inferior ou superior.
    // ============================================================================
    const alvoAntigo = comp.vida_alvo_horas || 1000;
    const horasReais = comp.horas_passadas || 0;
    const novoAlvoCalculado = Math.round((alvoAntigo * 0.70) + (horasReais * 0.30));
    
    document.getElementById('lifespanTrocaAlvo').value = novoAlvoCalculado;

    document.getElementById('lifespanTrocaDescricao').value = '';
    
    const codigoInput = document.getElementById('lifespanTrocaCodigo');
    if (codigoInput) codigoInput.value = comp.codigo_componente || '';

    const fotoInput = document.getElementById('lifespanTrocaFoto');
    if (fotoInput) fotoInput.value = ''; // clear previous

    const dataInput = document.getElementById('lifespanTrocaData');
    if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
    modalTroca.classList.add('open');
  }

  if (btnFecharTroca) {
    btnFecharTroca.addEventListener('click', () => {
      modalTroca.classList.remove('open');
    });
  }

  formTroca.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('lifespanTrocaId').value;
    
    // Convert photo to base64 if present
    let fotoBase64 = null;
    const fotoInput = document.getElementById('lifespanTrocaFoto');
    if (fotoInput && fotoInput.files && fotoInput.files[0]) {
      const file = fotoInput.files[0];
      try {
        fotoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });
      } catch (err) {
        console.error("Erro ao converter foto:", err);
      }
    }

    let nCodigo = document.getElementById('lifespanTrocaCodigo') ? document.getElementById('lifespanTrocaCodigo').value.trim() : null;
    const nComponente = document.getElementById('lifespanTrocaComponente').value.trim();
    if (!nCodigo && nComponente.toLowerCase().includes('livre retirada')) {
      nCodigo = 'LV' + Math.floor(10000 + Math.random() * 90000);
    }
    
    const payload = {
      novo_alvo_horas: parseInt(document.getElementById('lifespanTrocaAlvo').value),
      novo_codigo: nCodigo,
      nova_descricao: document.getElementById('lifespanTrocaDescricao').value,
      foto_url: fotoBase64,
      data_instalacao: document.getElementById('lifespanTrocaData').value || null
    };

    try {
      const btnSave = document.getElementById('btnSalvarLifespanTroca');
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando...';

      const res = await fetch(`/api/lifespan/components/${id}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        modalTroca.classList.remove('open');
        fetchLifespanComponents();
        if(window.Swal) Swal.fire({title:'Sucesso', text:'Troca registrada!', icon:'success', timer:2000, showConfirmButton:false});
      } else {
        throw new Error('Falha no servidor');
      }
    } catch(err) {
      console.error(err);
      if(window.Swal) Swal.fire('Erro', 'Não foi possível registrar a troca', 'error');
    } finally {
      const btnSave = document.getElementById('btnSalvarLifespanTroca');
      btnSave.disabled = false;
      btnSave.textContent = '💾 Confirmar Troca';
    }
  });

  // ==========================================
  // Sincronizar Produção (Excel)
  // ==========================================
  const btnImportProducao = document.getElementById('btnImportProducao');
  const fileImportProducao = document.getElementById('fileImportProducao');

  if (btnImportProducao && fileImportProducao) {
    btnImportProducao.addEventListener('click', () => {
      fileImportProducao.click();
    });

    fileImportProducao.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.XLSX) {
        if(window.Swal) Swal.fire('Erro', 'Biblioteca XLSX não carregada.', 'error');
        return;
      }

      if(window.Swal) {
        Swal.fire({
          title: 'Processando...',
          text: 'Lendo dados de produção.',
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); }
        });
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' });

          if (!raw || raw.length < 2) throw new Error('Arquivo vazio ou sem linhas de dados.');

          // Encontrar índices do cabeçalho
          let headerRow = 0;
          for (let i = 0; i < Math.min(10, raw.length); i++) {
            if (raw[i].some(c => String(c || '').toLowerCase().includes('linha'))) {
              headerRow = i;
              break;
            }
          }

          const headers = raw[headerRow].map(h => String(h || '').trim().toLowerCase());
          
          const iLinha = headers.findIndex(h => h.includes('linha'));
          const iData = headers.findIndex(h => h.includes('data'));
          const iDisp = headers.findIndex(h => h.includes('disponível') || h.includes('disponivel'));
          const iTrab = headers.findIndex(h => h.includes('trabalhado'));
          const iQtd = headers.findIndex(h => h.includes('produzida'));

          if (iLinha < 0 || iData < 0) {
            throw new Error('Colunas "Linha" ou "Data" não encontradas na planilha.');
          }

          const rows = [];
          for (let i = headerRow + 1; i < raw.length; i++) {
            const row = raw[i];
            const linha = String(row[iLinha] || '').trim();
            const dataStr = String(row[iData] || '').slice(0, 10);
            
            if (!linha || !dataStr) continue;

            // Extrair números corretamente (mantendo pontos e vírgulas)
            const parseNum = (val) => {
              if (!val) return 0;
              // Remove tudo que não for dígito, vírgula, ponto ou sinal negativo
              let v = String(val).replace(/[^\d,.-]/g, '');
              // Troca a vírgula por ponto para o parseFloat entender o decimal brasileiro
              v = v.replace(',', '.');
              return parseFloat(v) || 0;
            };

            // A planilha MGPRO já traz o tempo em MINUTOS, portanto NÃO multiplicar por 60!
            const dispMin = iDisp >= 0 ? parseNum(row[iDisp]) : 0;
            const trabMin = iTrab >= 0 ? parseNum(row[iTrab]) : 0;
            const qtdProd = iQtd >= 0 ? parseNum(row[iQtd]) : 0; // Quantidade Produzida

            rows.push({
              linha: linha,
              data: dataStr,
              tempo_disponivel: dispMin,
              tempo_trabalhado: trabMin,
              quantidade_produzida: qtdProd
            });
          }

          if (rows.length === 0) throw new Error('Nenhum dado válido de produção encontrado.');

          const resp = await fetch('/api/import/producao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows })
          });

          const result = await resp.json();
          if (!resp.ok) throw new Error(result.detail || 'Erro no servidor');

          if(window.Swal) Swal.fire('Sucesso!', `${result.importados} registros de produção sincronizados.`, 'success');
          localStorage.setItem('last_lifespan_sync', new Date().toISOString());
          atualizarDataSyncUI();
          fetchLifespanComponents(); // Refresh UI to calculate new aging

        } catch (err) {
          console.error(err);
          if(window.Swal) Swal.fire('Erro', err.message, 'error');
        }
      };
      
      reader.onerror = () => {
        if(window.Swal) Swal.fire('Erro', 'Falha ao ler o arquivo.', 'error');
      };

      reader.readAsArrayBuffer(file);
      e.target.value = ''; // reset
    });
  }

  // Hook into SSE (Realtime Sync) if db_updated event fires
  window.addEventListener('db_updated', () => {
    // Refresh only if lifespan view is open
    if (viewLifespan && viewLifespan.style.display !== 'none') {
      fetchLifespanComponents();
    }
  });

  // Initial Fetch & UI Setup
  atualizarDataSyncUI();
  fetchLifespanComponents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLifespan);
} else {
  initLifespan();
}
