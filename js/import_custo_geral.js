export async function initExcelImportCustoGeral(supabase, toast, atualizarDadosGlobais) {
  const btnFinanceiro = document.getElementById('btnImportarFinanceiro');
  const fileFinanceiro = document.getElementById('fileImportFinanceiro');
  const btnDatasul = document.getElementById('btnImportarDatasul');
  const fileDatasul = document.getElementById('fileImportDatasul');
  const btnFluxoDia = document.getElementById('btnFluxoDia');

  // =============================================
  // FLUXO DO DIA: Botão + Modal
  // =============================================
  _initFluxoDiaModal();
  await _carregarFluxoDia(supabase);

  // =============================================
  // UTILITÁRIO: Gera uma "assinatura" para uma linha
  // =============================================
  function _hashRow(r) {
    return [
      r.numero_ordem || '',
      r.it_codigo || '',
      r.dt_trans || '',
      r.esp_docto || '',
      r.nro_docto || '',
      String(r.custo_do_mes ?? ''),
      String(r.material ?? ''),
      String(r.ggf ?? ''),
      r.descricao_codigo || '',
      r.ct_codigo || ''
    ].join('|');
  }

  // =============================================
  // FLUXO DO DIA: Init do Modal
  // =============================================
  function _initFluxoDiaModal() {
    const modal = document.getElementById('modalFluxoDia');
    const btnFechar = document.getElementById('btnFecharFluxoDia');
    if (btnFluxoDia) {
      btnFluxoDia.addEventListener('click', () => {
        modal.style.display = 'flex';
      });
    }
    if (btnFechar) {
      btnFechar.addEventListener('click', () => { modal.style.display = 'none'; });
    }
    if (modal) {
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }
  }

  // =============================================
  // FLUXO DO DIA: Lê o DIFF_METADATA e popula o modal
  // =============================================
  async function _carregarFluxoDia(sb) {
    try {
      const { data } = await sb.from('custo_geral').select('descricao_codigo').eq('it_codigo', 'DIFF_METADATA').maybeSingle();
      if (!data) return;
      const diff = JSON.parse(data.descricao_codigo);
      _renderizarFluxoDia(diff);
    } catch (e) {
      console.warn('[FluxoDia] Erro ao carregar diff:', e);
    }
  }

  function _renderizarFluxoDia(diff) {
    if (!diff || (!diff.novos?.length && !diff.removidos?.length)) return;

    const btnFluxo = document.getElementById('btnFluxoDia');
    if (btnFluxo) btnFluxo.style.display = '';

    const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dataImport = diff.data_importacao ? new Date(diff.data_importacao).toLocaleString('pt-BR') : '';

    const subtitle = document.getElementById('lblFluxoDiaSubtitle');
    if (subtitle) subtitle.textContent = `Importação de ${dataImport} — diferenças vs. dia anterior`;

    document.getElementById('kpiFluxoNovos').textContent = diff.novos?.length ?? 0;
    document.getElementById('kpiFluxoRemovidos').textContent = diff.removidos?.length ?? 0;

    const impacto = (diff.novos || []).reduce((s, r) => s + (r.custo_do_mes || 0), 0)
                  - (diff.removidos || []).reduce((s, r) => s + (r.custo_do_mes || 0), 0);
    const kpiImpacto = document.getElementById('kpiFluxoImpacto');
    kpiImpacto.textContent = fmt(impacto);
    kpiImpacto.style.color = impacto >= 0 ? '#ef4444' : '#10b981';

    const tbody = document.getElementById('tbodyFluxoDia');
    if (!tbody) return;
    tbody.innerHTML = '';

    const addRows = (lista, tipo, cor, bg) => {
      lista.forEach(r => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        tr.style.background = bg;
        tr.innerHTML = `
          <td style="padding:0.5rem 0.75rem; color:${cor}; font-weight:600; white-space:nowrap;">${tipo}</td>
          <td style="padding:0.5rem 0.75rem; font-family:monospace;">${r.numero_ordem || '—'}</td>
          <td style="padding:0.5rem 0.75rem; color:var(--muted); font-size:0.8rem; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.descricao_codigo || r.descricao_emitente || '—'}</td>
          <td style="padding:0.5rem 0.75rem; color:var(--muted); font-size:0.8rem;">${r.ct_codigo || '—'}</td>
          <td style="padding:0.5rem 0.75rem; text-align:right; color:${cor}; font-weight:600;">${fmt(r.custo_do_mes)}</td>
        `;
        tbody.appendChild(tr);
      });
    };

    addRows(diff.novos || [], '▲ NOVO', '#f59e0b', 'rgba(245,158,11,0.05)');
    addRows(diff.removidos || [], '▼ REMOVIDO', '#ef4444', 'rgba(239,68,68,0.05)');
  }


  // =============================
  // IMPORTADOR FINANCEIRO
  // =============================
  if (btnFinanceiro && fileFinanceiro) {
    btnFinanceiro.addEventListener('click', () => {
      Swal.fire({
        title: 'Importar Planilha do Financeiro',
        html: `
          <p style="color:#94a3b8; margin-bottom:1rem;">Isso irá sincronizar o Custo Geral com a nova planilha, calculando as diferenças (Fluxo do Dia).</p>
          <label style="display:flex; align-items:center; gap:0.5rem; color:#f1f5f9; font-size:0.9rem; cursor:pointer;">
            <input type="checkbox" id="swalCheckPrimeiraDoMes" style="width:16px;height:16px;accent-color:#d4af37;" />
            Primeira importação do mês (limpeza total)
          </label>
        `,
        icon: 'info',
        showCancelButton: true,
        background: '#161f33',
        color: '#f1f5f9',
        confirmButtonColor: '#d4af37',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sim, importar'
      }).then((res) => {
        if (res.isConfirmed) {
          const primeiraDoMes = document.getElementById('swalCheckPrimeiraDoMes')?.checked ?? false;
          fileFinanceiro.dataset.primeiraDoMes = primeiraDoMes ? '1' : '0';
          fileFinanceiro.click();
        }
      });
    });

    fileFinanceiro.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const primeiraDoMes = fileFinanceiro.dataset.primeiraDoMes === '1';
      toast('Lendo arquivo do Financeiro...', 'info');

      try {
        const data = await file.arrayBuffer();
        const workbook = window.XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('moviment')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
        
        let headerIndex = -1;
        for (let i = 0; i < Math.min(20, rawJson.length); i++) {
          const rowStr = rawJson[i].map(c => String(c || '').toLowerCase()).join(' ');
          if (rowStr.includes('it-codigo') || rowStr.includes('numero-ordem') || rowStr.includes('item') || rowStr.includes('ordem')) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex === -1) {
          throw new Error("Não foi possível encontrar o cabeçalho correto nas primeiras 20 linhas da planilha.");
        }

        const headers = rawJson[headerIndex];
        const json = [];
        for (let i = headerIndex + 1; i < rawJson.length; i++) {
          const obj = {};
          let rowHasData = false;
          for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
              obj[headers[j]] = rawJson[i][j];
              if (rawJson[i][j] !== null && rawJson[i][j] !== '') rowHasData = true;
            }
          }
          if (rowHasData) json.push(obj);
        }

        if (json.length === 0) throw new Error("A planilha está vazia ou não contém dados válidos abaixo do cabeçalho.");

        // =============================
        // EXTRAIR BUDGETS (AOP)
        // =============================
        let budgetData = null;
        try {
          const aopSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('aop'));
          if (aopSheetName) {
            const aopSheet = workbook.Sheets[aopSheetName];
            const aopJson = window.XLSX.utils.sheet_to_json(aopSheet, { header: 1, defval: null });
            let bManutencao = 0, bFerramentaria = 0, bFacilities = 0;
            for (let i = 0; i < Math.min(100, aopJson.length); i++) {
              const row = aopJson[i];
              if (!row) continue;
              const strContent = row.map(c => String(c || '').toLowerCase().trim()).join(' ');
              if (strContent.includes('m&r') && !strContent.includes('budget m&r')) {
                const num = row.find(c => typeof c === 'number' && c > 10000);
                if (num) bManutencao = num;
              }
              if (strContent.includes('ferramentaria')) {
                const num = row.find(c => typeof c === 'number' && c > 10000);
                if (num) bFerramentaria = num;
              }
              if (strContent.includes('facilities') && !strContent.includes('svc')) {
                const num = row.find(c => typeof c === 'number' && c >= 10000);
                if (num) bFacilities = num;
              }
            }
            if (bManutencao || bFerramentaria || bFacilities) {
              budgetData = {
                manutencao: bManutencao, ferramentaria: bFerramentaria, facilities: bFacilities,
                total: bManutencao + bFerramentaria + bFacilities,
                data_importacao: new Date().toISOString()
              };
            }
          }
        } catch (e) { console.warn("Erro ao ler aba AOP:", e); }

        toast('Processando dados...', 'info');
        
        const parseMoney = (v, invert = false) => {
          if (v == null) return 0;
          let val = 0;
          if (typeof v === 'number') { val = v; }
          else {
            let str = String(v).split(';')[0].trim();
            if (str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
            val = Number(str) || 0;
          }
          return invert ? -val : val;
        };

        const parseDate = (val) => {
          if (!val) return null;
          if (typeof val === 'number') {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            return d.toISOString().split('T')[0];
          }
          try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
          } catch (e) { return null; }
        };

        const records = json.map(rawRow => {
          const row = {};
          for (let k in rawRow) {
            if (rawRow.hasOwnProperty(k)) row[k.toLowerCase().trim()] = rawRow[k];
          }
          return {
            cod_estabel: String(row['cod-estabel'] || ''),
            cod_depos: String(row['cod-depos'] || ''),
            it_codigo: String(row['it-codigo'] || row['item'] || ''),
            descricao_codigo: String(row['descrição codigo'] || row['descriçao codigo'] || row['descricao codigo'] || row['descricao'] || ''),
            grupo: String(row['grupo'] || ''),
            ct_codigo: String(row['ct-codigo'] || ''),
            descricao_conta: String(row['descrição conta2'] || row['descriçao conta2'] || row['descricao conta2'] || ''),
            dt_trans: parseDate(row['dt-trans'] || row['data']),
            mes: Number(row['mês'] || row['mes']) || null,
            esp_docto: String(row['esp-docto'] || ''),
            especdoc: String(row['especdoc'] || ''),
            tipo_trans: String(row['tipo-trans'] || ''),
            ent_sai: String(row['ent/sai'] || ''),
            quantidade: Number(row['quantidade'] || row['qtd']) || 0,
            un: String(row['un'] || ''),
            numero_ordem: String(row['nr-ord-produ'] || row['numero-ordem'] || row['ordem'] || ''),
            nro_docto: String(row['nro-docto'] || ''),
            linha: String(row['linha prod'] || row['linha'] || ''),
            cod_emitente: String(row['cod-emitente'] || ''),
            descricao_emitente: String(row['descrição emitente'] || row['descriçao emitente'] || row['descricao emitente'] || ''),
            solicitante: String(row['coluna1'] || row['nome-abrev'] || row['solicitante'] || ''),
            nome_solicitante: String(row['nome-aprov'] || row['nome_solicitante'] || ''),
            nat_operacao: String(row['nat-operacao'] || ''),
            material: parseMoney(row['material'] || row['valor material'] || row['valor-mat-m'], false),
            ggf: parseMoney(row['ggf'] || row['valor ggf'] || row['valor-ggf-m'], false),
            valor_mob: parseMoney(row['valor-mob-m'], false),
            valor_tt: parseMoney(row['valor tt'], false),
            quant_tt_ajustado: Number(row['quant tt ajustado']) || 0,
            custo_do_mes: parseMoney(row['custo do mês'] || row['custo do mes'], true),
            custo_mes_anterior: parseMoney(row['custo mês anterior'] || row['custo mes anterior'], true),
            custo_de_entrada: parseMoney(row['custo de entrada'], true),
            sc_codigo: String(row['sc-codigo'] || ''),
            descricao_db: String(row['check'] || row['coluna am'] || row['descricao-db'] || ''),
          };
        });

        if (records.length === 0) {
          throw new Error(`Nenhum registro válido encontrado. Verifique o formato da planilha.`);
        }

        // =============================
        // SALVAR FORECAST e BUDGET antigos (MERGE: preserva config manual)
        // =============================
        let forecastData = null;
        const { data: fc } = await supabase.from('custo_geral').select('*').eq('it_codigo', 'FORECAST_METADATA').maybeSingle();
        if (fc) forecastData = fc;

        // Sempre lê o BUDGET_METADATA existente para fazer merge
        let existingBudgetRaw = null;
        const { data: bd } = await supabase.from('custo_geral').select('*').eq('it_codigo', 'BUDGET_METADATA').maybeSingle();
        if (bd) {
          try { existingBudgetRaw = JSON.parse(bd.descricao_codigo); } catch(e) {}
        }

        if (budgetData) {
          // Merge: AOP atualiza os campos financeiros, mas preserva a configuração manual
          const merged = {
            ...existingBudgetRaw,         // base: preserva total_manual, categorias, responsaveis
            ...budgetData,                // sobrescreve manutencao, ferramentaria, facilities com AOP
          };
          // Se havia um override manual, restaura como manutencao (fonte do KPI)
          if (existingBudgetRaw?.total_manual != null) {
            merged.manutencao = existingBudgetRaw.total_manual;
            merged.total = existingBudgetRaw.total_manual;
          }
          records.push({
            it_codigo: 'BUDGET_METADATA',
            descricao_codigo: JSON.stringify(merged),
            numero_ordem: '0', quantidade: 0, custo_do_mes: 0
          });
          // Atualiza global para re-render imediato
          if (window.budgetMetadata !== undefined) window.budgetMetadata = merged;
        } else if (existingBudgetRaw) {
          // Sem aba AOP: restaura o BUDGET_METADATA existente intacto
          const oldClean = { ...bd };
          delete oldClean.id;
          records.push(oldClean);
        }

        // =============================================
        // LÓGICA DE DIFF (Sincronização Diferencial)
        // =============================================
        if (primeiraDoMes) {
          // VIRADA DE MÊS: limpa tudo e insere do zero
          toast('Primeira importação do mês — limpeza total...', 'info');
          let delCount = 0;
          while (true) {
            const { data: delData, error: delErr } = await supabase.from('custo_geral').delete().not('id', 'is', null).select('id');
            if (delErr) throw delErr;
            if (!delData || delData.length === 0) break;
            delCount += delData.length;
          }
          console.log(`[Import] Limpeza total: ${delCount} registros deletados.`);

          // Restaura metadados (forecastData e budgetMerged já estão em records)
          if (forecastData) { delete forecastData.id; records.push(forecastData); }

          // Apaga o DIFF do mês anterior
          await supabase.from('custo_geral').delete().eq('it_codigo', 'DIFF_METADATA');

          // FILTRO SEGURO DE COLUNAS
          const validColumns = [
            'cod_estabel', 'cod_depos', 'it_codigo', 'descricao_codigo', 'grupo', 'ct_codigo', 'descricao_conta', 'dt_trans', 'mes', 'esp_docto',
            'especdoc', 'tipo_trans', 'ent_sai', 'quantidade', 'un', 'numero_ordem', 'nro_docto', 'linha', 'cod_emitente', 'descricao_emitente',
            'solicitante', 'nome_solicitante', 'nat_operacao', 'material', 'ggf', 'valor_mob', 'valor_tt', 'quant_tt_ajustado', 'custo_do_mes',
            'custo_mes_anterior', 'custo_de_entrada', 'sc_codigo', 'descricao_db'
          ];
          const cleanRecords = records.map(r => {
            const cleanObj = {};
            for (const key of validColumns) {
              if (r[key] !== undefined) cleanObj[key] = r[key];
            }
            return cleanObj;
          });

          for (let i = 0; i < cleanRecords.length; i += 100) {
            const { error: insErr } = await supabase.from('custo_geral').insert(cleanRecords.slice(i, i + 100));
            if (insErr) throw insErr;
          }

          toast(`Planilha importada com sucesso! ${records.length} registros inseridos (virada de mês).`, 'success');

        } else {
          // IMPORTAÇÃO NORMAL: calcula diff
          toast('Calculando diferenças...', 'info');

          const SKIP_KEYS = ['BUDGET_METADATA', 'FORECAST_METADATA', 'DIFF_METADATA'];

          // Busca todos os registros atuais do banco (exceto metadados)
          let existentes = [];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data: page, error } = await supabase.from('custo_geral')
              .select('id, numero_ordem, it_codigo, dt_trans, esp_docto, nro_docto, custo_do_mes, material, ggf, descricao_codigo, ct_codigo')
              .not('it_codigo', 'in', `(${SKIP_KEYS.map(k => `"${k}"`).join(',')})`)
              .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!page || page.length === 0) break;
            existentes = existentes.concat(page);
            if (page.length < PAGE) break;
            from += PAGE;
          }
          console.log(`[Diff] ${existentes.length} registros existentes carregados do banco.`);

          // Gera mapas de hash
          const novasLinhas = records.filter(r => !SKIP_KEYS.includes(r.it_codigo));
          const mapaExistente = new Map(existentes.map(r => [_hashRow(r), r.id]));
          const mapaNovas    = new Set(novasLinhas.map(r => _hashRow(r)));

          // Linhas que estão no Excel mas não no banco = NOVOS
          const paraInserir = novasLinhas.filter(r => !mapaExistente.has(_hashRow(r)));

          // IDs que estão no banco mas não no Excel = REMOVIDOS
          const idsParaDeletar = existentes
            .filter(r => !mapaNovas.has(_hashRow(r)))
            .map(r => r.id);

          console.log(`[Diff] Novos: ${paraInserir.length} | Removidos: ${idsParaDeletar.length}`);

          // Registros removidos (para salvar no diff para exibição)
          const removidos = existentes.filter(r => !mapaNovas.has(_hashRow(r)));

          // DELETE em batch dos removidos
          for (let i = 0; i < idsParaDeletar.length; i += 100) {
            const batch = idsParaDeletar.slice(i, i + 100);
            const { error: delErr } = await supabase.from('custo_geral').delete().in('id', batch);
            if (delErr) throw delErr;
          }

          // INSERT dos novos
          const toInsert = [...paraInserir];
          
          // Nota: Em modo Diff, os metadados (BUDGET_METADATA, FORECAST_METADATA) não são apagados.
          // Portanto, se quisermos atualizar o BUDGET, precisaríamos fazer um UPDATE.
          // Por ora, a lógica principal de UPDATE do budget já insere/atualiza antes ou não precisa.
          // Se precisar atualizar o BUDGET ou FORECAST no diff, devemos fazer um UPDATE / UPSERT.
          if (forecastData || budgetData) {
              const upsertData = [];
              if (forecastData) { delete forecastData.id; upsertData.push(forecastData); }
              
              if (budgetData) {
                  // Re-cria o merge para upsert seguro
                  const merged = { ...window.budgetMetadata, ...budgetData };
                  if (window.budgetMetadata?.total_manual != null) {
                      merged.manutencao = window.budgetMetadata.total_manual;
                      merged.total = window.budgetMetadata.total_manual;
                  }
                  upsertData.push({
                      it_codigo: 'BUDGET_METADATA', 
                      descricao_codigo: JSON.stringify(merged), 
                      numero_ordem: '0', quantidade: 0, custo_do_mes: 0
                  });
              }
              if (upsertData.length > 0) {
                  await supabase.from('custo_geral').upsert(upsertData, { onConflict: 'it_codigo' });
              }
          }

          // FILTRO SEGURO DE COLUNAS: Garante que objetos não contenham chaves que a tabela custo_geral não possui (como last_modified_at herdado por proxy/cache)
          const validColumns = [
            'cod_estabel', 'cod_depos', 'it_codigo', 'descricao_codigo', 'grupo', 'ct_codigo', 'descricao_conta', 'dt_trans', 'mes', 'esp_docto',
            'especdoc', 'tipo_trans', 'ent_sai', 'quantidade', 'un', 'numero_ordem', 'nro_docto', 'linha', 'cod_emitente', 'descricao_emitente',
            'solicitante', 'nome_solicitante', 'nat_operacao', 'material', 'ggf', 'valor_mob', 'valor_tt', 'quant_tt_ajustado', 'custo_do_mes',
            'custo_mes_anterior', 'custo_de_entrada', 'sc_codigo', 'descricao_db'
          ];
          const cleanToInsert = toInsert.map(r => {
            const cleanObj = {};
            for (const key of validColumns) {
              if (r[key] !== undefined) cleanObj[key] = r[key];
            }
            return cleanObj;
          });

          for (let i = 0; i < cleanToInsert.length; i += 100) {
            const { error: insErr } = await supabase.from('custo_geral').insert(cleanToInsert.slice(i, i + 100));
            if (insErr) throw insErr;
          }

          // Salvar DIFF_METADATA no banco
          const diffPayload = {
            novos: paraInserir.slice(0, 500),   // limita a 500 para não estourar o JSON
            removidos: removidos.slice(0, 500),
            data_importacao: new Date().toISOString(),
            totais: {
              novos: paraInserir.length,
              removidos: idsParaDeletar.length,
              impacto: paraInserir.reduce((s,r) => s + (r.custo_do_mes||0), 0) - removidos.reduce((s,r) => s + (r.custo_do_mes||0), 0)
            }
          };

          await supabase.from('custo_geral').delete().eq('it_codigo', 'DIFF_METADATA');
          await supabase.from('custo_geral').insert({
            it_codigo: 'DIFF_METADATA',
            descricao_codigo: JSON.stringify(diffPayload),
            numero_ordem: '0', quantidade: 0, custo_do_mes: 0
          });

          // Renderiza o botão imediatamente
          _renderizarFluxoDia(diffPayload);

          toast(`Sincronização concluída! +${paraInserir.length} novos / -${idsParaDeletar.length} removidos.`, 'success');
        }

        fileFinanceiro.value = '';
        if (atualizarDadosGlobais) atualizarDadosGlobais();

      } catch (err) {
        console.error(err);
        const msg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        toast(`Erro: ${msg}`, 'error');
        fileFinanceiro.value = '';
      }
    });
  }

  // =============================
  // IMPORTADOR DATASUL (com Diff)
  // =============================
  if (btnDatasul && fileDatasul) {
    btnDatasul.addEventListener('click', () => {
      Swal.fire({
        title: 'Importar Planilha do Datasul',
        html: `
          <p style="color:#94a3b8; margin-bottom:1rem;">Atualiza a tabela de ordens do Datasul (Ordem → Requisitante), inserindo apenas as novas ordens e removendo as descontinuadas.</p>
          <label style="display:flex; align-items:center; gap:0.5rem; color:#f1f5f9; font-size:0.9rem; cursor:pointer;">
            <input type="checkbox" id="swalCheckDatasulPrimeiroMes" style="width:16px;height:16px;accent-color:#d4af37;" />
            Primeira importação do mês (limpeza total)
          </label>
        `,
        icon: 'info',
        showCancelButton: true,
        background: '#161f33',
        color: '#f1f5f9',
        confirmButtonColor: '#d4af37',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sim, importar'
      }).then((res) => {
        if (res.isConfirmed) {
          const primeiro = document.getElementById('swalCheckDatasulPrimeiroMes')?.checked ?? false;
          fileDatasul.dataset.primeiraDoMes = primeiro ? '1' : '0';
          fileDatasul.click();
        }
      });
    });

    fileDatasul.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const primeiraDoMes = fileDatasul.dataset.primeiraDoMes === '1';
      toast('Lendo arquivo do Datasul...', 'info');

      try {
        const data = await file.arrayBuffer();
        const workbook = window.XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!rawJson || rawJson.length < 2) throw new Error("A planilha do Datasul está vazia.");

        let headerIndex = -1;
        for (let i = 0; i < Math.min(15, rawJson.length); i++) {
          const rowStr = rawJson[i].map(c => String(c || '').toLowerCase().trim()).join('|');
          if (rowStr.includes('ordem') && rowStr.includes('requisitante')) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex === -1) headerIndex = 2;

        const headers = rawJson[headerIndex].map(h => String(h || '').trim().toLowerCase());
        const idxOrdem = headers.findIndex(h => h === 'ordem');
        const idxRequisitante = headers.findIndex(h => h === 'requisitante');

        if (idxOrdem === -1 || idxRequisitante === -1) {
          throw new Error(`Colunas obrigatórias não encontradas. Headers: [${headers.join(', ')}]`);
        }

        const novasOrdens = [];
        for (let i = headerIndex + 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || !row[idxOrdem]) continue;
          let ordemNorm = String(row[idxOrdem]).trim().replace(/\./g, '').replace(/\s/g, '');
          const requisitante = row[idxRequisitante] ? String(row[idxRequisitante]).trim().toLowerCase() : null;
          if (ordemNorm && requisitante) novasOrdens.push({ numero_ordem: ordemNorm, solicitante: requisitante });
        }

        if (novasOrdens.length === 0) throw new Error('Nenhum registro válido encontrado na planilha do Datasul.');

        toast(`${novasOrdens.length} ordens encontradas. Sincronizando...`, 'info');

        if (primeiraDoMes) {
          // Limpa tudo e reinsere
          const { error: delErr } = await supabase.from('datasul_ordens').delete().not('id', 'is', null);
          if (delErr) throw delErr;
          for (let i = 0; i < novasOrdens.length; i += 100) {
            const { error: insErr } = await supabase.from('datasul_ordens').upsert(novasOrdens.slice(i, i + 100), { onConflict: 'numero_ordem' });
            if (insErr) throw insErr;
          }
          toast(`Datasul sincronizado! ${novasOrdens.length} ordens importadas (virada de mês).`, 'success');

        } else {
          // DIFF: busca existentes e calcula diferenças
          const { data: existentes } = await supabase.from('datasul_ordens').select('numero_ordem, solicitante');
          const mapaExistente = new Map((existentes || []).map(r => [r.numero_ordem, r.solicitante]));
          const mapaNovas = new Map(novasOrdens.map(r => [r.numero_ordem, r.solicitante]));

          const paraUpsert = novasOrdens.filter(r => !mapaExistente.has(r.numero_ordem) || mapaExistente.get(r.numero_ordem) !== r.solicitante);
          const ordensRemovidas = (existentes || []).filter(r => !mapaNovas.has(r.numero_ordem)).map(r => r.numero_ordem);

          for (let i = 0; i < ordensRemovidas.length; i += 100) {
            const { error } = await supabase.from('datasul_ordens').delete().in('numero_ordem', ordensRemovidas.slice(i, i + 100));
            if (error) throw error;
          }
          for (let i = 0; i < paraUpsert.length; i += 100) {
            const { error } = await supabase.from('datasul_ordens').upsert(paraUpsert.slice(i, i + 100), { onConflict: 'numero_ordem' });
            if (error) throw error;
          }

          toast(`Datasul sincronizado! +${paraUpsert.length} atualizadas / -${ordensRemovidas.length} removidas.`, 'success');
        }

        fileDatasul.value = '';
        if (atualizarDadosGlobais) atualizarDadosGlobais();

      } catch (err) {
        console.error(err);
        toast(`Erro: ${err.message}`, 'error');
        fileDatasul.value = '';
      }
    });
  }

}
