export async function initExcelImport(supabase, toast, atualizarDadosGlobais) {
  const btn = document.getElementById('btnImportarExcel');
  const fileInput = document.getElementById('fileImportExcel');
  if (!btn || !fileInput) return;

  btn.addEventListener('click', (e) => {
    if (document.querySelector('.view.active')?.id === 'view-preventiva') return;
    
    // Show SweetAlert warning before proceeding
    Swal.fire({
      title: 'Atenção!',
      text: 'Você está prestes a apagar todos os dados atuais e substituí-los pela planilha. Tem certeza?',
      icon: 'warning',
      showCancelButton: true,
      background: '#161f33',
      color: '#f1f5f9',
      confirmButtonColor: '#d4af37',
      cancelButtonColor: '#0f1624',
      confirmButtonText: '<span style="color:#000; font-weight:600">Sim, sincronizar!</span>',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'swal-border-radius'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        fileInput.click();
      }
    });
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    toast('Lendo arquivo Excel...', 'info');
    
    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      
      // We will look for "Planilha1" or fallback to the first sheet
      const sheetName = workbook.SheetNames.includes('Planilha1') ? 'Planilha1' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: null });
      
      if (!json || json.length === 0) {
        throw new Error("A planilha está vazia.");
      }

      // Check if it has minimum required columns (Blindagem Estrutural)
      const firstRow = json[0];
      const keys = Object.keys(firstRow).map(k => k.toUpperCase());
      const hasItem = keys.some(k => k.includes('ITEM') || k === 'ID');
      const hasValor = keys.some(k => k.includes('VALOR'));
      
      if (!hasItem || !hasValor) {
        throw new Error("Planilha inválida. Não foram encontradas colunas vitais como 'ITEM/ID' ou 'VALOR'.");
      }

      toast('Validando e processando dados...', 'info');

      const parsedRecords = processExcelData(json);
      
      if (parsedRecords.length === 0) {
        throw new Error("Nenhuma linha válida encontrada na planilha após a validação.");
      }

      toast(`Planilha validada: ${parsedRecords.length} RCs válidas. Sincronizando com o banco...`, 'info');

      // Backup current data via Supabase in case of rollback
      const { data: currentData, error: backupError } = await supabase.from('rc_registros').select('*');
      if (backupError) {
        console.error("Backup failed", backupError);
        throw new Error("Falha ao criar backup local. Abortando para segurança.");
      }

      try {
        // DELETE ALL records
        const { error: deleteError } = await supabase.from('rc_registros').delete().not('id', 'is', null);
        if (deleteError) throw deleteError;

        // INSERT in batches of 50
        const batchSize = 50;
        for (let i = 0; i < parsedRecords.length; i += batchSize) {
          const batch = parsedRecords.slice(i, i + batchSize);
          const { error: insertError } = await supabase.from('rc_registros').insert(batch);
          if (insertError) throw insertError;
        }

        toast('Sincronização concluída com sucesso!', 'success');
        fileInput.value = ''; // Reset
        
        // Refresh globally
        if (typeof atualizarDadosGlobais === 'function') {
          atualizarDadosGlobais();
        }

      } catch (dbError) {
        const errorMsg = dbError.message || JSON.stringify(dbError);
        console.error("Falha ao inserir", dbError);
        toast('Erro ao inserir dados: ' + errorMsg, 'error');
        // Rollback
        await supabase.from('rc_registros').delete().not('id', 'is', null);
        if (currentData && currentData.length > 0) {
          const batchSize = 50;
          for (let i = 0; i < currentData.length; i += batchSize) {
            await supabase.from('rc_registros').insert(currentData.slice(i, i + batchSize));
          }
        }
        toast('Rollback concluído. A base antiga foi restaurada.', 'info');
      }

    } catch (error) {
      console.error(error);
      toast(`Falha na importação: ${error.message}`, 'error');
    }
    
    fileInput.value = ''; // Reset
  });
}

function processExcelData(json) {
  const records = [];
  let maxItemId = 1000;
  for (const row of json) {
    // Normalizing keys to handle cases and missing spaces
    const r = {};
    for (const key in row) {
      r[key.trim().toUpperCase()] = row[key];
    }

    let rawId = r['ID'] != null ? String(r['ID']).trim() : '';
    let parsedId = parseInt(rawId.replace(/\D/g, ''), 10);
    
    let idVal;
    if (!isNaN(parsedId)) {
      idVal = parsedId;
    } else {
      idVal = maxItemId;
      maxItemId++;
    }

    let nat = r['NATUREZA'] || r['COLUNA1'] || 'PENDENTE';
    let natureza = 'PENDENTE';
    if (nat) {
      nat = String(nat).toUpperCase();
      if (nat.includes('FABRICA')) natureza = 'FABRICACAO';
      else if (nat.includes('SERVI')) natureza = 'SERVICO';
      else if (nat.includes('CONSERTO')) natureza = 'CONSERTO';
      else if (nat.includes('COMPRA')) natureza = 'COMPRA';
    }

    let titulo = r['ID'] ? r['ITEM'] : (r['TÍTULO'] || r['TITULO'] || 'Sem Título');
    let descricao = r['DESCRIÇÃO FALHA'] || r['DESCRIÇÃO FALHA '] || r['DESCRICAO FALHA'] || '';

    let solicitante = r['SOLICITANTE'] || '';
    
    let crit = r['CRITICIDADE'];
    let criticidade = 'MEDIA';
    if (crit) {
      crit = String(crit).toUpperCase();
      if (crit.includes('ALTA')) criticidade = 'ALTA';
      else if (crit.includes('BAIXA')) criticidade = 'BAIXA';
    }

    let linha = r['LINHA'] || '';
    let maquina = r['MAQUINA'] || r['MÁQUINA'] || '';
    let fornecedor = r['FORNECEDOR'] || '';
    let nf_saida = r['NF DE SAÍDA'] || r['NF DE SAÍDA '] || r['NF DE SAIDA'] || '';
    let orcamento = r['ORÇAMENTO'] || r['ORCAMENTO'] || '';
    let rc = r['RC'] || '';
    let po = r['PO'] || '';

    let valor = r['VALOR'];
    if (typeof valor === 'string') {
      valor = valor.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
    }
    valor = Number(valor);
    if (isNaN(valor)) valor = 0;

    let data_saida = parseDate(r['DATA DE SAÍDA'] || r['DATA DE SAIDA']);
    let previsao_entrega = parseDate(r['PREVISAO_ENTREGA'] || r['PREVISÃO DE ENTREGA'] || r['PREVISAO DE ENTREGA']);
    let data_recebimento = parseDate(r['DATA RECEBIMENTO']);

    let statusRaw = r['STATUS'];
    let statusPlanilha = null;
    if (statusRaw) {
      statusRaw = String(statusRaw).toUpperCase().trim();
      if (statusRaw === 'ENTREGUE' || statusRaw === 'ENTREGE') statusPlanilha = 'ENTREGUE';
      else if (statusRaw.includes('ORÇAMENTO') || statusRaw.includes('ORCAMENTO')) statusPlanilha = 'PENDENTE DE ORCAMENTO';
      else if (statusRaw.includes('PEDIDO')) statusPlanilha = 'PENDENTE DE PEDIDO';
      else if (statusRaw.includes('RC')) statusPlanilha = 'PENDENTE DE RC';
      else if (statusRaw.includes('ENVIO')) statusPlanilha = 'PENDENTE DE ENVIO';
      else if (statusRaw.includes('ENTREGA')) statusPlanilha = 'PENDENTE DE ENTREGA';
      else statusPlanilha = statusRaw;
    }

    records.push({
      id: crypto.randomUUID(),
      item_id: idVal,
      natureza,
      item: String(titulo).trim(),
      descricao_falha: String(descricao).trim(),
      solicitante: String(solicitante).trim(),
      criticidade,
      linha: String(linha).trim(),
      maquina: String(maquina).trim(),
      fornecedor: String(fornecedor).trim(),
      nf_saida: String(nf_saida).trim(),
      data_saida,
      orcamento: String(orcamento).trim(),
      rc: String(rc).trim(),
      po: String(po).trim(),
      valor,
      previsao_entrega,
      data_recebimento,
      sinal: statusPlanilha || null,
      last_modified_by: 'Upload JS'
    });
  }
  return records;
}

function parseDate(val) {
  if (!val) return null;
  // If it's an excel serial date
  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 86400000;
    const dt = new Date(excelEpoch.getTime() + val * msPerDay);
    return dt.toISOString().split('T')[0];
  }
  // Try JS parse
  try {
    const dt = new Date(val);
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  } catch (e) {}
  return null;
}
