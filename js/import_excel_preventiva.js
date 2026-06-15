// Ajudante para busca flexível de valores: tenta exact match e depois substring match
function findVal(r, ...searchKeys) {
  for (const k of searchKeys) {
    if (r[k] !== null && r[k] !== undefined && r[k] !== '') return r[k];
  }
  for (const k of searchKeys) {
    const ku = k.toUpperCase();
    const found = Object.keys(r).find(rk => rk.includes(ku));
    if (found && r[found] !== null && r[found] !== undefined && r[found] !== '') return r[found];
  }
  return '';
}

// Parser numérico robusto: suporta vírgula decimal e strings
function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const clean = String(v).replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export async function initExcelImportPreventiva(supabase, toast, atualizarDadosGlobais) {
  const fileInput = document.getElementById('fileImportExcelPreventiva');
  const btn = document.getElementById('btnImportarPreventivaOnly');
  if (!btn || !fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Lendo arquivo Excel da Preventiva...', 'info');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

      if (!rows || rows.length < 2) throw new Error('A planilha está vazia ou sem cabeçalho.');

      // Encontrar a linha de cabeçalho — procura linha com "MAQUINA", "DESCRIÇÃO" ou "IDENTIFICADOR"
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && row.some(cell => {
          if (!cell) return false;
          const s = String(cell).toUpperCase().replace(/[\r\n]+/g, ' ').trim();
          return s.includes('MAQUINA') || s.includes('DESCRI') || s.includes('IDENTIFICADOR');
        })) {
          headerRowIndex = i;
          break;
        }
      }

      // Normalizar cabeçalhos: remover quebras de linha, uppercase, trim
      const headers = rows[headerRowIndex].map(h =>
        h ? String(h).replace(/[\r\n\t]+/g, ' ').toUpperCase().trim() : ''
      );

      const dataRows = rows.slice(headerRowIndex + 1);
      toast('Validando e processando dados da Preventiva...', 'info');

      // Log dos headers para debug
      console.log('[Preventiva Import] Headers detectados:', headers);

      const parsedRecordsMap = {};
      let lastIdentificador = '';
      let lastMaquina = '';

      for (const row of dataRows) {
        if (!row || row.every(c => c === null || c === '')) continue;

        const r = {};
        for (let i = 0; i < headers.length; i++) {
          r[headers[i]] = row[i];
        }

        let identificador = findVal(r, 'IDENTIFICADOR', 'ID', 'CÓDIGO', 'CODIGO');
        let maquina = findVal(r, 'MAQUINA', 'MÁQUINA');
        
        if (identificador) {
          lastIdentificador = identificador;
        } else {
          // Se tem máquina nova sem identificador explícito, gera um AUTO-ID
          if (maquina) {
            identificador = 'AUTO_' + crypto.randomUUID().split('-')[0].toUpperCase();
            lastIdentificador = identificador;
          } else {
            identificador = lastIdentificador;
          }
        }
        
        if (!identificador) continue;

        if (maquina) {
          lastMaquina = maquina;
        } else {
          maquina = lastMaquina;
        }
        
        const descricao    = findVal(r, 'DESCRI', 'ATIVIDADE', 'TAREFA', 'DESCRIÇÃO', 'DESCRIÇAO', 'DESCRICAO');
        const material     = findVal(r, 'MATERIAL', 'MATERIAIS', 'PEÇAS', 'PECAS');
        const plano_padrao = findVal(r, 'PLANO PADRAO ?', 'PLANO PADRÃO ?', 'PLANO PADRAO', 'PLANO PADRÃO') || 'S';

        const duracao_horas   = parseNum(findVal(r, 'DURAÇÃO HORAS', 'DURACAO HORAS', 'DURA'));
        const hh_mec          = parseNum(findVal(r, 'HH MEC'));
        const hh_eletrico     = parseNum(findVal(r, 'HH ELÉTRICO', 'HH ELETRICO'));
        const resp_fabrica    = String(findVal(r, 'RESP. FABRICA', 'RESP. FÁBRICA')).trim();
        const resp_manutencao = String(findVal(r, 'RESP. MANUTENÇÃO', 'RESP. MANUTENCAO')).trim();
        const status_auditoria = String(findVal(r, 'STATUS/ AUDITORIA', 'STATUS/AUDITORIA', 'STATUS')).trim();
        const previsao_custos  = parseNum(findVal(r, 'PREVISÃO DE CUSTOS.', 'PREVISAO DE CUSTOS', 'PREVISÃO DE CUSTOS'));

        // Programação: varrer colunas com "/" na key (datas) e DIA/NOITE
        const programacao = [];
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i];
          if (!h) continue;
          const hasDate = /\d{1,2}\/\d{1,2}/.test(h);
          if (hasDate && row[i]) {
            const turno = h.includes('NOITE') ? 'NOITE' : 'DIA';
            const dateStr = h.replace(/\s*(DIA|NOITE)\s*/i, '').trim();
            programacao.push({ data: dateStr, turno });
          }
        }

        if (!parsedRecordsMap[identificador]) {
          parsedRecordsMap[identificador] = {
            id: crypto.randomUUID(),
            identificador: String(identificador).trim(),
            maquina: String(maquina).trim(),
            material: material ? [String(material).trim()] : [],
            plano_padrao: String(plano_padrao).trim(),
            duracao_horas,
            hh_mec,
            hh_eletrico,
            resp_fabrica,
            resp_manutencao,
            status_auditoria,
            previsao_custos,
            atividades_descricoes: [],
            programacao
          };
        } else {
          for (const p of programacao) {
            if (!parsedRecordsMap[identificador].programacao.find(x => x.data === p.data && x.turno === p.turno)) {
              parsedRecordsMap[identificador].programacao.push(p);
            }
          }
          if (material) {
            const matStr = String(material).trim();
            if (!parsedRecordsMap[identificador].material.includes(matStr)) {
              parsedRecordsMap[identificador].material.push(matStr);
            }
          }
        }

        if (descricao) {
          parsedRecordsMap[identificador].atividades_descricoes.push(String(descricao).trim());
        }
      }

      const parsedRecords = Object.values(parsedRecordsMap);
      if (parsedRecords.length === 0) throw new Error('Nenhuma linha válida encontrada na planilha após a validação.');

      console.log('[Preventiva Import] Amostra do 1º registro:', parsedRecords[0]);
      toast(`Planilha validada: ${parsedRecords.length} atividades encontradas. Sincronizando...`, 'info');

      // Backup + delete + insert
      const { data: backupData } = await supabase.from('preventiva_registros').select('*');

      try {
        // Apaga apenas o Plano Padrão (onde linha e mes são nulos) para não excluir as atividades já aplicadas!
        const { error: deleteError } = await supabase.from('preventiva_registros')
          .delete()
          .is('linha', null)
          .is('mes', null)
          .neq('setor', 'frontend'); // protege também as de frontend que têm linha nula

        if (deleteError) throw deleteError;

        const batchSize = 50;
        for (let i = 0; i < parsedRecords.length; i += batchSize) {
          const batch = parsedRecords.slice(i, i + batchSize);
          const { error: insertError } = await supabase.from('preventiva_registros').insert(batch);
          if (insertError) throw insertError;
        }

        toast('✅ Importação da Preventiva concluída com sucesso!', 'success');
        fileInput.value = '';
        if (typeof atualizarDadosGlobais === 'function') atualizarDadosGlobais();

      } catch (dbError) {
        console.error('[Preventiva Import] Falha ao inserir:', dbError);
        toast('Erro ao inserir: ' + (dbError.message || JSON.stringify(dbError)), 'error');
        // Rollback
        await supabase.from('preventiva_registros').delete().not('id', 'is', null);
        if (backupData?.length) {
          for (let i = 0; i < backupData.length; i += 50) {
            await supabase.from('preventiva_registros').insert(backupData.slice(i, i + 50));
          }
        }
      }

    } catch (error) {
      console.error('[Preventiva Import]', error);
      toast(`Falha na importação: ${error.message}`, 'error');
    }

    fileInput.value = '';
  });

  btn.addEventListener('click', () => {
    Swal.fire({
      title: 'Importar Preventiva',
      text: 'Esta ação apagará todos os dados de Preventiva e os substituirá pela planilha. Deseja continuar?',
      icon: 'warning',
      showCancelButton: true,
      background: '#161f33',
      color: '#f1f5f9',
      confirmButtonColor: '#d4af37',
      cancelButtonColor: '#0f1624',
      confirmButtonText: '<span style="color:#000;font-weight:600">Sim, sincronizar!</span>',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'swal-border-radius' }
    }).then(result => { if (result.isConfirmed) fileInput.click(); });
  });
}

// ============================================================
// IMPORTADOR EXCLUSIVO FRONT-END
// Lê a aba "FRONT-END" da planilha PREVENTIVA LINHA 06.xlsx
// Salva registros com setor = 'frontend'
// ============================================================
export async function initExcelImportPreventivaFrontend(supabase, toast, atualizarDadosGlobais) {
  const fileInput = document.getElementById('fileImportExcelPreventivaFE');
  const btn = document.getElementById('btnImportarPreventivaSomenteFE');
  if (!btn || !fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Lendo planilha Front-end...', 'info');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });

      // Localizar aba FRONT-END (case-insensitive)
      const sheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('FRONT')) || workbook.SheetNames[0];
      console.log('[FE Import] Usando aba:', sheetName);

      const worksheet = workbook.Sheets[sheetName];
      // header:1 retorna array de arrays; linha 0 = título, linha 1 = cabeçalho, dados a partir da linha 2
      const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

      if (!rows || rows.length < 3) throw new Error('A aba Front-end está vazia ou sem dados.');

      // Colunas por índice fixo (baseado na estrutura da planilha PREVENTIVA LINHA 06):
      // [0] MAQUINA | [1] DESCRIÇÃO | [2] DURAÇÃO Horas | [3] FREQUÊNCIA Meses
      // [4] HH Mec  | [5] HH Elétrico | [6] HH Lub | [7] Sugestão
      const COLS = { MAQUINA: 0, DESCRICAO: 1, DURACAO: 2, FREQUENCIA: 3, HH_MEC: 4, HH_ELET: 5, HH_LUB: 6, SUGESTAO: 7 };

      const parseNum = (v) => {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        const clean = String(v).replace(/\s/g, '').replace(',', '.');
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Dados começam na linha índice 2 (pula título[0] e cabeçalho[1])
      const dataRows = rows.slice(2);

      const parsedRecords = [];
      let lastMaquina = '';
      let indexPerMaquina = {};

      for (const row of dataRows) {
        if (!row || row.every(c => c === null || c === '')) continue;

        const maquinaCell = row[COLS.MAQUINA];
        if (maquinaCell && String(maquinaCell).trim()) {
          lastMaquina = String(maquinaCell).trim();
        }
        if (!lastMaquina) continue;

        const descricao = row[COLS.DESCRICAO] ? String(row[COLS.DESCRICAO]).trim() : '';
        if (!descricao) continue;

        // Gerar identificador sequencial por máquina
        if (!indexPerMaquina[lastMaquina]) indexPerMaquina[lastMaquina] = 1;
        const idx = indexPerMaquina[lastMaquina]++;
        const identificador = `${lastMaquina} - ${String(idx).padStart(2, '0')}`;

        parsedRecords.push({
          identificador,
          maquina: lastMaquina,
          atividades_descricoes: [descricao],
          material: [],
          plano_padrao: 'S',
          duracao_horas: parseNum(row[COLS.DURACAO]),
          frequencia_meses: parseNum(row[COLS.FREQUENCIA]) || null,
          hh_mec: parseNum(row[COLS.HH_MEC]),
          hh_eletrico: parseNum(row[COLS.HH_ELET]),
          hh_lub: parseNum(row[COLS.HH_LUB]),
          sugestao: row[COLS.SUGESTAO] ? String(row[COLS.SUGESTAO]).trim() : '',
          resp_fabrica: row[COLS.SUGESTAO] ? String(row[COLS.SUGESTAO]).trim() : '',
          resp_manutencao: '',
          status_auditoria: '',
          previsao_custos: 0,
          programacao: [],
          setor: 'frontend',
          area_producao: 'FRONT-END',
        });
      }

      if (parsedRecords.length === 0) throw new Error('Nenhuma atividade válida encontrada na aba Front-end.');

      console.log('[FE Import] Registros processados:', parsedRecords.length, '| Amostra:', parsedRecords[0]);
      toast(`Planilha Front-end validada: ${parsedRecords.length} atividades. Sincronizando...`, 'info');

      // Backup dos dados frontend atuais
      const { data: backupData } = await supabase
        .from('preventiva_registros')
        .select('*')
        .eq('setor', 'frontend');

      try {
        // Apagar APENAS registros frontend (nunca toca no backend)
        const { error: deleteError } = await supabase
          .from('preventiva_registros')
          .delete()
          .eq('setor', 'frontend');
        if (deleteError) throw deleteError;

        // Inserir em lotes
        const batchSize = 50;
        for (let i = 0; i < parsedRecords.length; i += batchSize) {
          const batch = parsedRecords.slice(i, i + batchSize);
          const { error: insertError } = await supabase.from('preventiva_registros').insert(batch);
          if (insertError) throw insertError;
        }

        toast('✅ Importação Front-end concluída! ' + parsedRecords.length + ' atividades importadas.', 'success');
        fileInput.value = '';
        if (typeof atualizarDadosGlobais === 'function') atualizarDadosGlobais();

      } catch (dbError) {
        console.error('[FE Import] Falha ao inserir:', dbError);
        toast('Erro ao inserir: ' + (dbError.message || JSON.stringify(dbError)), 'error');
        // Rollback: restaurar backup
        await supabase.from('preventiva_registros').delete().eq('setor', 'frontend');
        if (backupData?.length) {
          for (let i = 0; i < backupData.length; i += 50) {
            await supabase.from('preventiva_registros').insert(backupData.slice(i, i + 50));
          }
        }
      }

    } catch (error) {
      console.error('[FE Import]', error);
      toast(`Falha na importação Front-end: ${error.message}`, 'error');
    }

    fileInput.value = '';
  });

  btn.addEventListener('click', () => {
    Swal.fire({
      title: 'Importar Planilha Front-end',
      html: '<p>Esta ação apagará <strong>apenas</strong> os dados do setor <span style="color:#6ee7b7">Front-end</span> e os substituirá pela planilha.</p><p style="font-size:0.85rem;color:#94a3b8;margin-top:0.5rem;">Os dados do Back-end <strong>não serão afetados</strong>.</p>',
      icon: 'warning',
      showCancelButton: true,
      background: '#161f33',
      color: '#f1f5f9',
      confirmButtonColor: '#6ee7b7',
      cancelButtonColor: '#0f1624',
      confirmButtonText: '<span style="color:#000;font-weight:600">Sim, importar Front-end!</span>',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'swal-border-radius' }
    }).then(result => { if (result.isConfirmed) fileInput.click(); });
  });
}
