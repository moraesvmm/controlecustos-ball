// =============================================================================
// MÓDULO: Retomada Linha 05 — Outubro
// UX Premium — Melhor visualização do sistema
// =============================================================================

(function() {
  'use strict';

  // -------------- Estado global do módulo -----------------
  let _dados = [];
  let _filtroMaquina = '';
  let _filtroBusca = '';
  let _filtroStatus = '';
  let _carregado = false;
  let _aberto = false;

  // Máquinas únicas (ordem de aparecimento)
  const MACHINE_COLORS = {
    'GIRAFA':   { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.5)',  text: '#38bdf8' },
    'PT':       { bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.5)',  text: '#fbbf24' },
    'TT':       { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.5)', text: '#a78bfa' },
    'AC1':      { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.5)',  text: '#34d399' },
    'AC2':      { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.5)',  text: '#34d399' },
    'AC3':      { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.5)',  text: '#34d399' },
    'CN':       { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.5)', text: '#fb7185' },
    'LINHA':    { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.5)', text: '#fb7185' },
    'FP':       { bg: 'rgba(253,186,116,0.15)', border: 'rgba(253,186,116,0.5)', text: '#fba16b' },
    'EMB':      { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.5)',  text: '#818cf8' },
    'EM':       { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.5)',  text: '#818cf8' },
    'IP':       { bg: 'rgba(244,114,182,0.15)', border: 'rgba(244,114,182,0.5)', text: '#f472b6' },
    'LV':       { bg: 'rgba(34,211,238,0.15)',  border: 'rgba(34,211,238,0.5)',  text: '#22d3ee' },
    'VE':       { bg: 'rgba(163,230,53,0.15)',  border: 'rgba(163,230,53,0.5)',  text: '#a3e635' },
    'VI':       { bg: 'rgba(249,168,212,0.15)', border: 'rgba(249,168,212,0.5)', text: '#f9a8d4' },
    'DECORAÇÃO':{ bg: 'rgba(212,175,55,0.15)',  border: 'rgba(212,175,55,0.5)',  text: '#d4af37' },
  };

  function getMachineColor(m) {
    return MACHINE_COLORS[m] || { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', text: '#94a3b8' };
  }

  // -------------- KPIs -----------------
  function calcKPIs(dados) {
    const total      = dados.length;
    const concluidos = dados.filter(r => r.status === 'CONCLUÍDO').length;
    const emExec     = dados.filter(r => r.status === 'EM EXECUÇÃO').length;
    const pendentes  = total - concluidos - emExec;
    const hhTotal    = dados.reduce((s, r) => s + (parseFloat(r.duracao) || 0), 0);
    const hhFeito    = dados.filter(r => r.status === 'CONCLUÍDO').reduce((s, r) => s + (parseFloat(r.duracao) || 0), 0);
    
    // Cálculo do HH Restante baseado na % de execução de cada atividade
    let hhRestante = 0;
    dados.forEach(r => {
      const d = parseFloat(r.duracao) || 0;
      const p = parseFloat(r.perc_execucao) || 0;
      hhRestante += d - (d * (p / 100));
    });

    const percGeral  = total ? Math.round((concluidos / total) * 100) : 0;
    const maquinas   = [...new Set(dados.map(r => r.maquina))].filter(Boolean).length;
    return { total, concluidos, emExec, pendentes, hhTotal, hhFeito, hhRestante, percGeral, maquinas };
  }

  // -------------- Filtros -----------------
  function dadosFiltrados() {
    return _dados.filter(r => {
      const mOk = !_filtroMaquina || r.maquina === _filtroMaquina;
      const sOk = !_filtroStatus  || r.status === _filtroStatus;
      const bTerm = _filtroBusca.toLowerCase();
      const bOk = !bTerm || (r.descricao || '').toLowerCase().includes(bTerm) ||
                  (r.maquina || '').toLowerCase().includes(bTerm) ||
                  (r.profissional || '').toLowerCase().includes(bTerm) ||
                  String(r.id).includes(bTerm) || (r.os || '').includes(bTerm);
      return mOk && sOk && bOk;
    });
  }

  // -------------- Renderização -----------------
  function render() {
    // Target the inner container (the last div inside rl05-body)
    const bodyEl = document.getElementById('rl05-body');
    if (!bodyEl) return;
    const container = document.getElementById('rl05-table-container');
    if (!container) return;

    const filtrados = dadosFiltrados();
    const kpis = calcKPIs(_dados); // KPIs sempre do total
    const kpisFiltrados = calcKPIs(filtrados);

    // ---- Atualizar KPIs ----
    const kEl = id => document.getElementById(id);
    if (kEl('rl05-kpi-total'))      kEl('rl05-kpi-total').textContent = kpis.total;
    if (kEl('rl05-kpi-concluidos')) kEl('rl05-kpi-concluidos').textContent = kpis.concluidos;
    if (kEl('rl05-kpi-execucao'))   kEl('rl05-kpi-execucao').textContent = kpis.emExec;
    if (kEl('rl05-kpi-pendentes'))  kEl('rl05-kpi-pendentes').textContent = kpis.pendentes;
    if (kEl('rl05-kpi-hh'))         kEl('rl05-kpi-hh').textContent = kpis.hhTotal.toFixed(0) + 'h';
    if (kEl('rl05-kpi-hh-rest'))    kEl('rl05-kpi-hh-rest').textContent = kpis.hhRestante.toFixed(1) + 'h';
    if (kEl('rl05-kpi-maquinas'))   kEl('rl05-kpi-maquinas').textContent = kpis.maquinas;

    // Atualizar barra de progresso geral
    if (kEl('rl05-prog-bar')) {
      kEl('rl05-prog-bar').style.width = kpis.percGeral + '%';
      kEl('rl05-prog-bar').style.background = kpis.percGeral === 100
        ? 'linear-gradient(90deg, #10b981, #34d399)'
        : kpis.percGeral > 50
          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
          : 'linear-gradient(90deg, #3b82f6, #60a5fa)';
    }
    if (kEl('rl05-prog-pct'))   kEl('rl05-prog-pct').textContent = kpis.percGeral + '%';
    if (kEl('rl05-prog-label')) kEl('rl05-prog-label').textContent = `${kpis.concluidos} de ${kpis.total} concluídas`;

    // ---- Atualizar filtro de máquinas ----
    const maqSelect = kEl('rl05-filter-maquina');
    if (maqSelect && maqSelect.children.length <= 1) {
      const maquinas = [...new Set(_dados.map(r => r.maquina).filter(Boolean))].sort();
      maquinas.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        maqSelect.appendChild(opt);
      });
    }

    // ---- Renderizar tabela agrupada por máquina ----
    const maquinas = [...new Set(filtrados.map(r => r.maquina).filter(Boolean))];

    if (filtrados.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 4rem; color: var(--muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <p style="font-size: 1.1rem;">Nenhuma atividade encontrada com os filtros aplicados.</p>
        </div>`;
      return;
    }

    container.innerHTML = maquinas.map(maquina => {
      const rows = filtrados.filter(r => r.maquina === maquina);
      const col = getMachineColor(maquina);
      const mKpis = calcKPIs(rows);
      const mPerc = mKpis.percGeral;

      return `
      <div class="rl05-group" style="margin-bottom: 1.5rem; border: 1px solid ${col.border}; border-radius: 12px; overflow: hidden; transition: box-shadow 0.3s;">
        <!-- Cabeçalho da Máquina -->
        <div style="background: ${col.bg}; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;"
             onclick="this.closest('.rl05-group').querySelector('.rl05-group-body').classList.toggle('rl05-collapsed')">
          <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <span style="background: ${col.border}; color: #fff; font-weight: 700; font-size: 0.75rem; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.05em;">${maquina}</span>
            <span style="font-weight: 600; font-size: 0.95rem; color: ${col.text};">${rows.length} atividade${rows.length !== 1 ? 's' : ''}</span>
            <span style="font-size: 0.8rem; color: var(--muted);">· ${mKpis.concluidos} concluída${mKpis.concluidos !== 1 ? 's' : ''}</span>
            <span style="font-size: 0.8rem; color: #818cf8; background: rgba(99,102,241,0.1); padding: 2px 6px; border-radius: 4px;">Est: ${mKpis.hhTotal.toFixed(1)}h</span>
            <span style="font-size: 0.8rem; color: #f472b6; background: rgba(236,72,153,0.1); padding: 2px 6px; border-radius: 4px;">Restam: ${mKpis.hhRestante.toFixed(1)}h</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 120px; background: rgba(0,0,0,0.2); border-radius: 50px; height: 6px; overflow: hidden;">
              <div style="height: 100%; width: ${mPerc}%; background: ${mPerc === 100 ? '#10b981' : mPerc > 0 ? '#f59e0b' : '#334155'}; border-radius: 50px; transition: width 0.5s;"></div>
            </div>
            <span style="font-size: 0.85rem; font-weight: 600; color: ${mPerc === 100 ? '#10b981' : mPerc > 0 ? '#f59e0b' : 'var(--muted)'}; min-width: 35px; text-align: right;">${mPerc}%</span>
            <button type="button" onclick="event.stopPropagation(); window.rl05ExportSectionPDF('${maquina}');" title="Exportar somente ${maquina}" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: inherit; padding: 4px 8px; border-radius: 999px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;">
              <span style="font-size: 0.92rem; line-height: 1;">📄</span>
            </button>
            <span style="color: var(--muted); font-size: 1.1rem; transition: transform 0.2s;">▾</span>
          </div>
        </div>

        <!-- Tabela de atividades -->
        <div class="rl05-group-body" style="transition: all 0.3s;">
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
              <thead>
                <tr style="background: rgba(0,0,0,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);">
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 55px; border-bottom: 1px solid rgba(255,255,255,0.08);">ID</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08);">Descrição</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 90px; border-bottom: 1px solid rgba(255,255,255,0.08);">H-H</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 120px; border-bottom: 1px solid rgba(255,255,255,0.08);">Profissional</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 80px; border-bottom: 1px solid rgba(255,255,255,0.08);">OS</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 220px; border-bottom: 1px solid rgba(255,255,255,0.08);">% Execução</th>
                  <th style="position: sticky; top: 0; z-index: 10; background: #0f172a; padding: 1rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; width: 130px; border-bottom: 1px solid rgba(255,255,255,0.08);">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => renderRow(r, col)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');

    // Attach event listeners for percent inputs
    container.querySelectorAll('.rl05-perc-input').forEach(el => {
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.target.blur(); }
        if (e.key === 'Escape') { e.target.value = e.target.dataset.original; e.target.blur(); }
      });
      el.addEventListener('change', function(e) {
        e.stopPropagation();
        const id = parseInt(this.dataset.id);
        let val = parseFloat(this.value);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 100) val = 100;
        this.value = val;
        salvarPerc(id, val, this);
      });
      el.addEventListener('click', e => e.stopPropagation());
    });

    // Attach range listeners
    container.querySelectorAll('.rl05-range-input').forEach(el => {
      el.addEventListener('input', function() {
        const id = parseInt(this.dataset.id);
        const numInput = document.querySelector(`.rl05-perc-input[data-id="${id}"]`);
        if (numInput) numInput.value = this.value;
        // Update bar visually
        const bar = document.querySelector(`.rl05-row-bar[data-id="${id}"]`);
        if (bar) {
          const pct = parseInt(this.value);
          bar.style.width = pct + '%';
          bar.style.background = pct >= 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#334155';
        }
      });
      el.addEventListener('change', function(e) {
        // impede de clicar na linha
        e.stopPropagation();
        const id = parseInt(this.dataset.id);
        const val = parseFloat(this.value);
        const numInput = document.querySelector(`.rl05-perc-input[data-id="${id}"]`);
        if (numInput) numInput.value = val;
        salvarPerc(id, val, this);
      });
      el.addEventListener('click', e => e.stopPropagation());
    });

    // Attach OS listeners
    container.querySelectorAll('.rl05-os-input').forEach(el => {
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.target.blur(); }
        if (e.key === 'Escape') { e.target.value = e.target.dataset.original; e.target.blur(); }
      });
      el.addEventListener('change', function(e) {
        e.stopPropagation();
        const id = parseInt(this.dataset.id);
        salvarOS(id, this.value, this);
      });
      el.addEventListener('click', e => e.stopPropagation());
    });
  }

  function renderRow(r, col) {
    const perc = parseFloat(r.perc_execucao) || 0;
    const isConcluido = r.status === 'CONCLUÍDO';
    const isEmExec = r.status === 'EM EXECUÇÃO';

    const statusBadge = isConcluido
      ? `<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:600; white-space:nowrap;">✅ CONCLUÍDO</span>`
      : isEmExec
        ? `<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:600; white-space:nowrap;">🔄 EM EXECUÇÃO</span>`
        : `<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(148,163,184,0.1); color:var(--muted); border:1px solid rgba(148,163,184,0.2); padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:500; white-space:nowrap;">— PENDENTE</span>`;

    const rowBg = isConcluido
      ? 'rgba(16,185,129,0.03)'
      : isEmExec
        ? 'rgba(245,158,11,0.04)'
        : 'transparent';

    const rowBorderLeft = isConcluido
      ? '3px solid rgba(16,185,129,0.5)'
      : isEmExec
        ? '3px solid rgba(245,158,11,0.5)'
        : '3px solid transparent';

    const percBarColor = perc >= 100 ? '#10b981' : perc > 0 ? '#f59e0b' : '#1e293b';

    // Truncate description
    const descTruncated = r.descricao && r.descricao.length > 90
      ? r.descricao.substring(0, 88) + '…'
      : (r.descricao || '—');

    return `
    <tr class="rl05-table-row" data-id="${r.id}" style="background: ${rowBg}; border-left: ${rowBorderLeft}; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.2s; cursor: pointer;"
        onclick="this.closest('.rl05-group-body').querySelectorAll('.rl05-table-row').forEach(tr => tr.style.backgroundColor=''); window.selecionarLinhaRL05('${r.id}')"
        ondblclick="window.abrirDetalheRL05('${r.id}')"
        onmouseenter="if(!this.classList.contains('rl05-selected')) this.style.background='rgba(255,255,255,0.03)'"
        onmouseleave="if(!this.classList.contains('rl05-selected')) this.style.background='${rowBg}'">
      <td style="padding: 1.15rem 1rem; color: var(--muted); font-family: monospace; font-size: 0.8rem; font-weight: 600;">#${r.id}</td>
      <td style="padding: 1.15rem 1rem; max-width: 380px;">
        <div title="${(r.descricao || '').replace(/"/g, '&quot;')}" style="line-height: 1.5; color: ${isConcluido ? 'var(--muted)' : '#ffffff'}; font-weight: ${isConcluido ? '400' : '500'}; font-size: 0.875rem;">${descTruncated}</div>
      </td>
      <td style="padding: 1.15rem 1rem; text-align: center; color: var(--muted); font-size: 0.85rem;">${r.duracao ? r.duracao + 'h' : '—'}</td>
      <td style="padding: 1.15rem 1rem; color: var(--muted); font-size: 0.8rem;">${r.profissional || '—'}</td>
      <td style="padding: 1.15rem 1rem; text-align: center;">
        <input type="text" class="rl05-os-input" data-id="${r.id}" data-original="${r.os || ''}"
          value="${r.os || ''}" placeholder="—"
          style="width: 70px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--muted); padding: 3px 6px; text-align: center; font-family: monospace; font-size: 0.8rem; outline: none; transition: all 0.2s;"
          onfocus="this.style.borderColor='rgba(56,189,248,0.5)'; this.style.color='var(--text)';"
          onblur="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.color='var(--muted)';">
      </td>
      <td style="padding: 1.15rem 1rem;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <!-- Slider + número -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="range" class="rl05-range-input" data-id="${r.id}" min="0" max="100" step="5" value="${perc}"
              style="flex: 1; accent-color: ${percBarColor}; cursor: ${isConcluido ? 'default' : 'pointer'};"
              ${isConcluido ? 'disabled' : ''}>
            <input type="number" class="rl05-perc-input" data-id="${r.id}" data-original="${perc}"
              min="0" max="100" step="1" value="${perc}"
              style="width: 52px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text); padding: 3px 6px; text-align: center; font-size: 0.85rem; font-weight: 600; outline: none;"
              ${isConcluido ? 'disabled style="cursor:default; opacity:0.6;"' : ''}>
            <span style="color: var(--muted); font-size: 0.8rem;">%</span>
          </div>
          <!-- Bar de progresso fina -->
          <div style="height: 4px; background: rgba(0,0,0,0.2); border-radius: 50px; overflow: hidden;">
            <div class="rl05-row-bar" data-id="${r.id}" style="height: 100%; width: ${perc}%; background: ${percBarColor}; border-radius: 50px; transition: width 0.4s, background 0.3s;"></div>
          </div>
        </div>
      </td>
      <td style="padding: 1.15rem 1rem; text-align: center;" id="rl05-status-${r.id}">${statusBadge}</td>
    </tr>`;
  }

  // -------------- Salvar % e OS -----------------
  async function salvarOS(id, val, inputEl) {
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    if (tr) tr.style.opacity = '0.6';

    try {
      const resp = await fetch(`http://127.0.0.1:8080/api/retomada_l05/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ os: val })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const updated = await resp.json();

      // Update local data
      const idx = _dados.findIndex(r => r.id === id);
      if (idx !== -1) _dados[idx] = { ..._dados[idx], ...updated };

      if (inputEl) {
        inputEl.dataset.original = val;
      }
      
      if (window.toast) window.toast('OS salva!', 'success');
    } catch (err) {
      console.error('Erro ao salvar OS:', err);
      if (window.toast) window.toast('Erro ao salvar OS: ' + err.message, 'error');
      if (inputEl) inputEl.value = inputEl.dataset.original || '';
    } finally {
      if (tr) tr.style.opacity = '1';
      render(); // Força re-renderização
    }
  }
  async function salvarPerc(id, val, inputEl) {
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    if (tr) tr.style.opacity = '0.6';

    try {
      const resp = await fetch(`http://127.0.0.1:8080/api/retomada_l05/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perc_execucao: val })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const updated = await resp.json();

      // Update local data
      const idx = _dados.findIndex(r => r.id === id);
      if (idx !== -1) _dados[idx] = { ..._dados[idx], ...updated };

      // Update status badge without full re-render
      const statusCell = document.getElementById(`rl05-status-${id}`);
      if (statusCell) {
        const st = updated.status;
        if (st === 'CONCLUÍDO') {
          statusCell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;white-space:nowrap;">✅ CONCLUÍDO</span>`;
          if (tr) { tr.style.background = 'rgba(16,185,129,0.03)'; tr.style.borderLeft = '3px solid rgba(16,185,129,0.5)'; }
        } else if (st === 'EM EXECUÇÃO') {
          statusCell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;white-space:nowrap;">🔄 EM EXECUÇÃO</span>`;
          if (tr) { tr.style.background = 'rgba(245,158,11,0.04)'; tr.style.borderLeft = '3px solid rgba(245,158,11,0.5)'; }
        } else {
          statusCell.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(148,163,184,0.1);color:var(--muted);border:1px solid rgba(148,163,184,0.2);padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:500;white-space:nowrap;">— PENDENTE</span>`;
          if (tr) { tr.style.background = 'transparent'; tr.style.borderLeft = '3px solid transparent'; }
        }
      }

      // Update bar color
      const bar = document.querySelector(`.rl05-row-bar[data-id="${id}"]`);
      if (bar) {
        const p = parseFloat(updated.perc_execucao) || 0;
        bar.style.width = p + '%';
        bar.style.background = p >= 100 ? '#10b981' : p > 0 ? '#f59e0b' : '#1e293b';
      }

      // Update range and num inputs if val was clamped
      const range = document.querySelector(`.rl05-range-input[data-id="${id}"]`);
      const num = document.querySelector(`.rl05-perc-input[data-id="${id}"]`);
      const finalPerc = parseFloat(updated.perc_execucao) || 0;
      if (range) { range.value = finalPerc; range.style.accentColor = finalPerc >= 100 ? '#10b981' : finalPerc > 0 ? '#f59e0b' : '#334155'; }
      if (num) { num.value = finalPerc; num.dataset.original = finalPerc; }

      // Disable inputs if concluded
      if (updated.status === 'CONCLUÍDO') {
        if (range) range.disabled = true;
        if (num)   num.disabled = true;
      }

      // Re-render KPIs and machine headers
      updateKPIsAndHeaders();

      if (window.toast) window.toast('Progresso salvo!', 'success');

    } catch (err) {
      console.error('Erro ao salvar %:', err);
      if (window.toast) window.toast('Erro ao salvar progresso: ' + err.message, 'error');
      // Revert
      if (inputEl) inputEl.value = inputEl.dataset.original || 0;
    } finally {
      if (tr) tr.style.opacity = '1';
      render(); // Força re-renderização para garantir a exibição correta
    }
  }

  function updateKPIsAndHeaders() {
    const kpis = calcKPIs(_dados);
    const el = id => document.getElementById(id);
    if (el('rl05-kpi-total'))      el('rl05-kpi-total').textContent = kpis.total;
    if (el('rl05-kpi-concluidos')) el('rl05-kpi-concluidos').textContent = kpis.concluidos;
    if (el('rl05-kpi-execucao'))   el('rl05-kpi-execucao').textContent = kpis.emExec;
    if (el('rl05-kpi-pendentes'))  el('rl05-kpi-pendentes').textContent = kpis.pendentes;
    if (el('rl05-prog-bar')) {
      el('rl05-prog-bar').style.width = kpis.percGeral + '%';
      el('rl05-prog-bar').style.background = kpis.percGeral === 100
        ? 'linear-gradient(90deg,#10b981,#34d399)'
        : kpis.percGeral > 50
          ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
          : 'linear-gradient(90deg,#3b82f6,#60a5fa)';
    }
    if (el('rl05-prog-pct'))   el('rl05-prog-pct').textContent = kpis.percGeral + '%';
    if (el('rl05-prog-label')) el('rl05-prog-label').textContent = `${kpis.concluidos} de ${kpis.total} concluídas`;
    // Update machine group mini bars
    const maquinas = [...new Set(_dados.map(r => r.maquina))];
    maquinas.forEach(m => {
      const mRows = _dados.filter(r => r.maquina === m);
      const mKpis = calcKPIs(mRows);
      // Update mini bar within group headers — they'll be refreshed on next render
    });
  }

  // -------------- Carregar dados -----------------
  async function carregar() {
    const loading = document.getElementById('rl05-loading');
    const body = document.getElementById('rl05-body');
    if (loading) loading.style.display = 'flex';
    if (body) body.style.display = 'none';

    try {
      const resp = await fetch('http://127.0.0.1:8080/api/retomada_l05');
      if (!resp.ok) throw new Error('Servidor não respondeu');
      _dados = await resp.json();
      _carregado = true;

      if (loading) loading.style.display = 'none';
      if (body) body.style.display = 'block';
      render();
    } catch (err) {
      console.error('Retomada L05:', err);
      if (loading) {
        loading.innerHTML = `
          <div style="text-align:center;">
            <div style="font-size:2rem; margin-bottom:1rem;">⚠️</div>
            <p style="color:#ef4444;">Erro ao carregar dados.</p>
            <p style="color:var(--muted); font-size:0.85rem;">${err.message}</p>
            <button onclick="window.rl05Toggle()" style="margin-top:1rem;" class="btn btn-outline">Tentar novamente</button>
          </div>`;
      }
    }
  }

  // -------------- Toggle do dropdown -----------------
  window.rl05Toggle = function() {
    const content = document.getElementById('rl05-content');
    const icon = document.getElementById('rl05-toggle-icon');
    if (!content) return;

    _aberto = !_aberto;
    if (_aberto) {
      content.style.maxHeight = '9000px';
      content.style.opacity = '1';
      if (icon) icon.style.transform = 'rotate(180deg)';
      if (!_carregado) carregar();
      else render();
    } else {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      if (icon) icon.style.transform = 'rotate(0deg)';
    }
  };

  // -------------- Filtros externos -----------------
  window.rl05FiltroBusca = function(val) {
    _filtroBusca = val;
    render();
  };
  window.rl05FiltroMaquina = function(val) {
    _filtroMaquina = val;
    render();
  };
  window.rl05FiltroStatus = function(val) {
    _filtroStatus = val;
    render();
  };

  // -------------- Import via UI -----------------
  async function parseRetomadaExcel(file) {
    if (!window.XLSX) throw new Error('Biblioteca XLSX não carregada.');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets['Planilha2'];
    if (!ws) throw new Error('Aba "Planilha2" não encontrada no arquivo.');
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const atividades = [];
    for (let i = 4; i < raw.length; i++) {
      const row = raw[i];
      if (!row[0]) continue;
      const stRaw = String(row[7] || '').toUpperCase();
      let status = null;
      if (stRaw.includes('CONCLU')) status = 'CONCLUÍDO';
      else if (stRaw.includes('EXECU')) status = 'EM EXECUÇÃO';
      let perc = parseFloat(row[5]) || 0;
      if (perc >= 100) { perc = 100; status = 'CONCLUÍDO'; }
      else if (perc > 0 && !status) status = 'EM EXECUÇÃO';
      atividades.push({
        id: parseInt(row[0]),
        maquina: String(row[1] || '').trim(),
        descricao: String(row[2] || '').trim().replace(/\n/g, ' | '),
        duracao: parseFloat(row[3]) || null,
        profissional: String(row[4] || '').trim(),
        perc_execucao: perc,
        os: row[6] ? String(row[6]).trim() : null,
        status: status,
      });
    }
    return atividades;
  }

  async function enviarImportRetomada(atividades) {
    const resp = await fetch('http://127.0.0.1:8080/api/retomada_l05/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(atividades)
    });
    if (!resp.ok) throw new Error(await resp.text());
    return await resp.json();
  }

  window.rl05ImportExcel = async function(file) {
    const btn = document.getElementById('rl05-btn-import');
    if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

    try {
      const atividades = await parseRetomadaExcel(file);
      const result = await enviarImportRetomada(atividades);
      _dados = [];
      _carregado = false;
      await carregar();
      if (window.toast) window.toast(`✅ ${result.imported} atividades importadas com sucesso!`, 'success');
    } catch (err) {
      console.error(err);
      if (window.toast) window.toast('Erro na importação: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📁 Atualizar Excel'; }
    }
  };

  window.rl05ExportSectionPDF = function(maquina) {
    const dados = dadosFiltrados().filter((a) => String(a.maquina || '').toUpperCase() === String(maquina || '').toUpperCase());
    if (dados.length === 0) {
      if (window.toast) window.toast(`Nenhuma atividade filtrada para ${maquina}.`, 'error');
      else alert(`Nenhuma atividade filtrada para ${maquina}.`);
      return;
    }
    gerarChecklistRetomadaPDF(dados);
  };

  // -------------- CSS do Módulo -----------------
  function injectCSS() {
    if (document.getElementById('rl05-styles')) return;
    const style = document.createElement('style');
    style.id = 'rl05-styles';
    style.textContent = `
      #rl05-wrapper {
        margin-bottom: 2rem;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset;
      }
      #rl05-header {
        background: linear-gradient(135deg, rgba(20,30,50,0.95) 0%, rgba(15,25,45,0.98) 100%);
        border: 1px solid rgba(56,189,248,0.25);
        border-bottom: none;
        border-radius: 16px 16px 0 0;
        padding: 1.5rem 2rem;
        cursor: pointer;
        transition: background 0.2s;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      #rl05-header:hover { background: linear-gradient(135deg, rgba(25,38,60,0.98) 0%, rgba(20,32,55,0.99) 100%); }
      #rl05-content {
        background: linear-gradient(180deg, rgba(13,19,33,0.97) 0%, rgba(10,16,28,0.99) 100%);
        border: 1px solid rgba(56,189,248,0.15);
        border-top: none;
        border-radius: 0 0 16px 16px;
        max-height: 0;
        opacity: 0;
        overflow: hidden;
        transition: max-height 0.5s ease, opacity 0.3s ease;
      }
      #rl05-content.open {
        max-height: 50000px;
        opacity: 1;
      }
      .rl05-kpi-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0;
        padding: 1.5rem 2rem;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: transparent;
      }
      .rl05-kpi-card {
        flex: 1;
        min-width: 120px;
        background: transparent;
        border: none;
        border-right: 1px solid rgba(255,255,255,0.08);
        border-radius: 0;
        padding: 0.5rem 1.5rem;
        transition: opacity 0.2s;
      }
      .rl05-kpi-card:last-child { border-right: none; }
      .rl05-kpi-card:hover { opacity: 0.8; }
      .rl05-kpi-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin-bottom: 0.4rem; display: flex; align-items: center; }
      .rl05-kpi-value { font-size: 1.85rem; font-weight: 300; line-height: 1; color: var(--text); }
      .rl05-filters {
        display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;
        padding: 1rem 2rem;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: rgba(0,0,0,0.1);
      }
      .rl05-filter-input {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        color: var(--text);
        padding: 0.5rem 0.875rem;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.2s;
        font-family: 'DM Sans', sans-serif;
      }
      .rl05-filter-input:focus { border-color: rgba(56,189,248,0.5); }
      .rl05-group-body { overflow: visible; }
      .rl05-group-body.rl05-collapsed { display: none; }
      .rl05-range-input { height: 4px; border-radius: 50px; }
      input[type=number].rl05-perc-input::-webkit-inner-spin-button,
      input[type=number].rl05-perc-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number].rl05-perc-input { -moz-appearance: textfield; }
    `;
    document.head.appendChild(style);
  }

  // -------------- Action Bar & Drilldown -----------------
  let linhaSelecionadaId = null;

  window.selecionarLinhaRL05 = function(id) {
    linhaSelecionadaId = id;
    document.querySelectorAll('.rl05-table-row').forEach(tr => tr.classList.remove('row-selected', 'rl05-selected'));
    const tr = document.querySelector(`.rl05-table-row[data-id="${id}"]`);
    if (tr) {
      tr.classList.add('row-selected', 'rl05-selected');
      // Adicionar estilo inline de destaque temporário, além da classe
      tr.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
    }

    const bar = document.getElementById('rowActionBarRL05');
    if (bar) {
      bar.classList.remove('hidden');
      document.getElementById('rowActionLabelRL05').textContent = `Atividade #${id} selecionada`;
    }
  }

  // HTML Modal Logic
  const fecharModalRL05 = () => document.getElementById('modalEditarAtividadeRL05')?.classList.remove('open');
  document.getElementById('btnFecharModalAtividadeRL05')?.addEventListener('click', fecharModalRL05);
  document.getElementById('btnCancelarModalAtividadeRL05')?.addEventListener('click', fecharModalRL05);
  document.getElementById('modalEditarAtividadeRL05')?.addEventListener('click', (e) => { 
    if (e.target === document.getElementById('modalEditarAtividadeRL05')) fecharModalRL05(); 
  });

  window.abrirModalRL05 = function(id) {
    const r = _dados.find(x => String(x.id) === String(id));
    if (!r) return;

    document.getElementById('modalAtivTituloRL05').textContent = `Editar Atividade #${r.id}`;
    document.getElementById('editAtivIdRL05').value = r.id;
    document.getElementById('editAtivDescRL05').value = r.descricao || '';
    document.getElementById('editAtivMaquinaRL05').value = r.maquina || '';
    document.getElementById('editAtivProfissionalRL05').value = r.profissional || '';
    document.getElementById('editAtivDuracaoRL05').value = r.duracao || '';

    document.getElementById('modalEditarAtividadeRL05').classList.add('open');
  };

  window.abrirDetalheRL05 = function(id) {
    const r = _dados.find(x => String(x.id) === String(id));
    if (!r) return;
    
    // Select the row visually
    window.selecionarLinhaRL05(id);

    const panel = document.getElementById('drillPanel');
    const overlay = document.getElementById('drillOverlay');
    if (!panel) return;

    const tituloTruncado = r.descricao && r.descricao.length > 60 ? r.descricao.substring(0, 57) + '...' : (r.descricao || 'Retomada L05');
    document.getElementById('drillTitulo').textContent = tituloTruncado;
    document.getElementById('drillSubtitulo').textContent = `${r.maquina || 'Geral'} · Retomada L05`;
    
    const stats = [
      { label: 'Duração', value: r.duracao ? r.duracao + 'h' : '—' },
      { label: 'Profissional', value: r.profissional || '—' },
      { label: 'OS', value: r.os || '—' },
      { label: 'Status', value: r.status || '—' },
      { label: '% Execução', value: r.execucao_pct != null ? r.execucao_pct + '%' : '0%' }
    ];
    document.getElementById('drillStats').innerHTML = stats.map(s =>
      `<div class="drill-stat"><span>${s.label}</span><strong>${s.value}</strong></div>`
    ).join('');
    
    document.getElementById('drillInsight').style.display = 'none';
    const desc = r.descricao || 'Não informado';

    const formatCards = (text) => {
      const safeText = String(text || '');
      if (!safeText || safeText.trim() === '') return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">Não informado</p>`;
      const steps = safeText.split(/\n/).map(s => s.trim().replace(/^[-–]/, '').trim()).filter(s => s.length > 1);
      if (steps.length === 0) return `<p style="color: var(--muted); padding: 1rem; background: var(--bg); border-radius: 8px;">${safeText}</p>`;
      return steps.map((step, idx) => `
        <div style="background: var(--bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 0.75rem; display: flex; gap: 1rem; align-items: flex-start; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <span style="background: rgba(212, 175, 55, 0.15); color: var(--primary); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: bold; flex-shrink: 0; border: 1px solid rgba(212, 175, 55, 0.3);">${idx + 1}</span>
          <span style="font-size: 0.95rem; line-height: 1.5; color: var(--text); padding-top: 2px;">${step}</span>
        </div>
      `).join('');
    };

    const descHTML = formatCards(desc);

    document.getElementById('drillLista').innerHTML = `
      <article class="drill-item" style="padding:1.5rem;background:transparent;border:none;">
        <h4 style="margin-top:0;color:var(--text);margin-bottom:1rem;font-size:1.05rem;display:flex;align-items:center;gap:0.5rem;">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Descrição da Atividade
        </h4>
        ${descHTML}
        
        <div class="drill-item-actions" style="margin-top:2rem;">
          <button type="button" class="btn-primary" onclick="abrirModalRL05('${r.id}');fecharDrilldown();" style="width:100%;">✏️ Editar Atividade</button>
        </div>
      </article>`;
      
    panel.classList.add('open');
    overlay.classList.add('open');
  };

  document.getElementById('formEditarAtividadeRL05')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editAtivIdRL05').value;
    const formValues = {
      descricao: document.getElementById('editAtivDescRL05').value.trim(),
      maquina: document.getElementById('editAtivMaquinaRL05').value.trim(),
      profissional: document.getElementById('editAtivProfissionalRL05').value.trim(),
      duracao: parseFloat(document.getElementById('editAtivDuracaoRL05').value) || null
    };

    try {
      const resp = await fetch(`http://127.0.0.1:8080/api/retomada_l05/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      if (!resp.ok) throw new Error(await resp.text());
      fecharModalRL05();
      carregarRegistros();
      Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false, background: '#1e293b', color: '#f8fafc' });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Erro ao salvar', text: err.message, background: '#1e293b', color: '#f8fafc' });
    }
  });

  window.excluirRL05 = async function(id) {
    const r = _dados.find(x => String(x.id) === String(id));
    if (!r) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Tem certeza?',
      text: `Deseja excluir a atividade #${r.id}? Isso não pode ser desfeito.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sim, Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      background: '#1e293b',
      color: '#f8fafc',
      customClass: { popup: 'swal-minimalist' }
    });

    if (isConfirmed) {
      try {
        const resp = await fetch(`http://127.0.0.1:8080/api/retomada_l05/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(await resp.text());
        carregarRegistros();
        Swal.fire({ icon: 'success', title: 'Excluído!', timer: 1500, showConfirmButton: false, background: '#1e293b', color: '#f8fafc' });
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Erro ao excluir', text: err.message, background: '#1e293b', color: '#f8fafc' });
      }
    }
  };

  window.duplicarRL05 = async function(id) {
    const r = _dados.find(x => String(x.id) === String(id));
    if (!r) return;
    try {
      const novo = { ...r };
      delete novo.id; // O back-end vai gerar um novo
      const resp = await fetch(`http://127.0.0.1:8080/api/retomada_l05`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([novo])
      });
      if (!resp.ok) throw new Error(await resp.text());
      carregarRegistros();
      Swal.fire({ icon: 'success', title: 'Duplicado!', timer: 1500, showConfirmButton: false, background: '#1e293b', color: '#f8fafc' });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Erro ao duplicar', text: err.message, background: '#1e293b', color: '#f8fafc' });
    }
  };

  function setupActionBar() {
    const btnDetalhe = document.getElementById('btnRowDetalheRL05');
    if (btnDetalhe) btnDetalhe.onclick = () => { if (linhaSelecionadaId) window.abrirDetalheRL05(linhaSelecionadaId); };
    
    const btnEditar = document.getElementById('btnRowEditarRL05');
    if (btnEditar) btnEditar.onclick = () => { if (linhaSelecionadaId) window.abrirModalRL05(linhaSelecionadaId); };
    
    const btnDuplicar = document.getElementById('btnRowDuplicarRL05');
    if (btnDuplicar) btnDuplicar.onclick = () => { if (linhaSelecionadaId) window.duplicarRL05(linhaSelecionadaId); };
    
    const btnExcluir = document.getElementById('btnRowExcluirRL05');
    if (btnExcluir) btnExcluir.onclick = () => { if (linhaSelecionadaId) window.excluirRL05(linhaSelecionadaId); };

    const btnLimpar = document.getElementById('btnRowLimparSelRL05');
    if (btnLimpar) {
      btnLimpar.onclick = () => {
        linhaSelecionadaId = null;
        document.querySelectorAll('.rl05-table-row').forEach(tr => {
           tr.classList.remove('row-selected', 'rl05-selected');
           tr.style.backgroundColor = '';
        });
        const bar = document.getElementById('rowActionBarRL05');
        if (bar) bar.classList.add('hidden');
      };
    }
  }

  // -------------- Init -----------------
  function init() {
    injectCSS();
    setupActionBar();
  }

  // Expose init and methods
  window.initRetomadaL05 = init;
  window.getDadosFiltradosRL05 = dadosFiltrados;

})();
