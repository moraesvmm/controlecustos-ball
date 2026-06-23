export async function initExcelImportCustoGeral(supabase, toast, atualizarDadosGlobais) {
  const btnFinanceiro = document.getElementById('btnImportarFinanceiro');
  const fileFinanceiro = document.getElementById('fileImportFinanceiro');
  const btnDatasul = document.getElementById('btnImportarDatasul');
  const fileDatasul = document.getElementById('fileImportDatasul');


  // =============================
  // IMPORTADOR FINANCEIRO
  // =============================
  if (btnFinanceiro && fileFinanceiro) {
    btnFinanceiro.addEventListener('click', () => {
      Swal.fire({
        title: 'Importar Planilha do Financeiro',
        text: 'Isso irá apagar os dados atuais do Custo Geral e substituir pelos novos. Confirma?',
        icon: 'warning',
        showCancelButton: true,
        background: '#161f33',
        color: '#f1f5f9',
        confirmButtonColor: '#d4af37',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sim, importar'
      }).then((res) => {
        if (res.isConfirmed) fileFinanceiro.click();
      });
    });

    fileFinanceiro.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
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
          throw new Error("Não foi possível encontrar o cabeçalho correto nas primeiras 20 linhas da planilha. Verifique se as colunas 'it-codigo' ou 'numero-ordem' existem.");
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

        toast('Processando dados...', 'info');
        
        const records = json.map(rawRow => {
          // Normalize keys to lowercase for case-insensitive matching
          const row = {};
          for (let k in rawRow) {
            if (rawRow.hasOwnProperty(k)) {
              row[k.toLowerCase().trim()] = rawRow[k];
            }
          }

          const parseMoney = (v, invert = false) => {
            if (v == null) return 0;
            let val = 0;
            if (typeof v === 'number') {
              val = v;
            } else {
              let str = String(v).split(';')[0].trim();
              if (str.includes(',')) {
                str = str.replace(/\./g, '').replace(',', '.');
              }
              val = Number(str) || 0;
            }
            // Inverte o sinal se for uma coluna de custo do ERP (que vêm negativo).
            // Estornos vêm positivos no ERP, então ao inverter, viram negativos (abatimento).
            return invert ? -val : val;
          };

          const parseDate = (val) => {
            if (!val) return null;
            // Se for número (serial date do Excel, ex: 45293)
            if (typeof val === 'number') {
              // 25569 é a diferença de dias entre 1900-01-01 e 1970-01-01
              const d = new Date(Math.round((val - 25569) * 86400 * 1000));
              // Corrige o timezone para evitar que caia no dia anterior
              d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
              return d.toISOString().split('T')[0];
            }
            // Se for string no formato ISO ou outro suportado pelo JS
            try {
              const d = new Date(val);
              if (isNaN(d.getTime())) return null;
              return d.toISOString().split('T')[0];
            } catch (e) {
              return null;
            }
          };

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
            descricao_db: String(row['descricao-db'] || ''),
          };
        }).filter(r => r.it_codigo || r.numero_ordem); // ignorar linhas vazias

        if (records.length === 0) {
          const colunasLidas = json.length > 0 ? Object.keys(json[0]).join(', ') : 'nenhuma coluna lida';
          throw new Error(`Nenhum registro válido. Colunas lidas do arquivo: [${colunasLidas}]. Nenhuma bateu com 'it-codigo', 'item', 'numero-ordem' ou 'ordem'. O cabeçalho deve estar na primeira linha.`);
        }

        toast(`Salvando ${records.length} registros no banco...`, 'info');

        const { error: delErr } = await supabase.from('custo_geral').delete().not('id', 'is', null);
        if (delErr) throw delErr;

        for (let i = 0; i < records.length; i += 100) {
          const batch = records.slice(i, i + 100);
          const { error: insErr } = await supabase.from('custo_geral').insert(batch);
          if (insErr) throw insErr;
        }

        toast('Planilha do Financeiro importada com sucesso!', 'success');
        fileFinanceiro.value = '';
        if (atualizarDadosGlobais) atualizarDadosGlobais();

      } catch (err) {
        console.error(err);
        toast(`Erro: ${err.message}`, 'error');
        fileFinanceiro.value = '';
      }
    });
  }

  // =============================
  // IMPORTADOR DATASUL
  // =============================
  if (btnDatasul && fileDatasul) {
    btnDatasul.addEventListener('click', () => {
      Swal.fire({
        title: 'Importar Planilha do Datasul',
        text: 'Isso irá atualizar a tabela de ordens do Datasul (Ordem → Requisitante). Confirma?',
        icon: 'info',
        showCancelButton: true,
        background: '#161f33',
        color: '#f1f5f9',
        confirmButtonColor: '#d4af37',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sim, importar'
      }).then((res) => {
        if (res.isConfirmed) fileDatasul.click();
      });
    });

    fileDatasul.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      toast('Lendo arquivo do Datasul...', 'info');

      try {
        const data = await file.arrayBuffer();
        const workbook = window.XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!rawJson || rawJson.length < 2) throw new Error("A planilha do Datasul está vazia.");

        // Buscar a linha do header dinamicamente
        let headerIndex = -1;
        for (let i = 0; i < Math.min(15, rawJson.length); i++) {
          const rowStr = rawJson[i].map(c => String(c || '').toLowerCase().trim()).join('|');
          if (rowStr.includes('ordem') && rowStr.includes('requisitante')) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex === -1) {
          // Fallback: tentar a row 2 (index 2) como no formato padrão do gotoexcel
          console.warn('[Datasul Import] Header não encontrado automaticamente, tentando row 2...');
          headerIndex = 2;
        }

        const headers = rawJson[headerIndex].map(h => String(h || '').trim().toLowerCase());
        console.log('[Datasul Import] Headers detectados:', headers);

        // Encontrar índices das colunas relevantes
        const idxOrdem = headers.findIndex(h => h === 'ordem');
        const idxRequisitante = headers.findIndex(h => h === 'requisitante');

        if (idxOrdem === -1 || idxRequisitante === -1) {
          throw new Error(`Colunas obrigatórias não encontradas. Headers lidos: [${headers.join(', ')}]. Esperado: 'Ordem' e 'Requisitante'.`);
        }

        const records = [];
        for (let i = headerIndex + 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || !row[idxOrdem]) continue;
          
          // Normalizar numero_ordem: remover pontos e espaços (5914.44 → 591444)
          let ordemRaw = String(row[idxOrdem]).trim();
          let ordemNorm = ordemRaw.replace(/\./g, '').replace(/\s/g, '');
          const requisitante = row[idxRequisitante] ? String(row[idxRequisitante]).trim().toLowerCase() : null;
          
          if (ordemNorm && requisitante) {
            records.push({ numero_ordem: ordemNorm, solicitante: requisitante });
          }
        }

        if (records.length === 0) throw new Error('Nenhum registro válido encontrado na planilha do Datasul.');

        toast(`Encontrados ${records.length} registros. Atualizando base...`, 'info');

        // Limpar tabela antes de inserir
        const { error: delErr } = await supabase.from('datasul_ordens').delete().not('id', 'is', null);
        if (delErr) throw delErr;

        // Inserir em batches (upsert para segurança)
        for (let i = 0; i < records.length; i += 100) {
          const batch = records.slice(i, i + 100);
          const { error: insErr } = await supabase.from('datasul_ordens').upsert(batch, { onConflict: 'numero_ordem' });
          if (insErr) throw insErr;
        }

        toast(`Datasul sincronizado com sucesso! ${records.length} ordens importadas.`, 'success');
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
