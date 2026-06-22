import { getClient } from './db.js';
import { toast } from './ui.js';

export function initImportPlanoMestre() {
  const btnImport = document.getElementById('btnImportPlanoMestre');
  const fileInput = document.getElementById('filePlanoMestre');

  if (!btnImport || !fileInput) return;

  btnImport.addEventListener('click', () => {
    window.Swal.fire({
      title: 'Importar Plano Mestre',
      text: 'Isso irá apagar as máquinas e atividades atuais do Plano Mestre e importar as novas da planilha. Confirma?',
      icon: 'warning',
      showCancelButton: true,
      background: '#161f33',
      color: '#f1f5f9',
      confirmButtonColor: '#d4af37',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sim, importar'
    }).then(res => {
      if (res.isConfirmed) fileInput.click();
    });
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    toast('Lendo arquivo do Plano Mestre...', 'info');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });

      let maquinasToInsert = [];
      let atividadesToInsert = [];

      for (const sheetName of workbook.SheetNames) {
        // Pular abas irrelevantes
        if (!sheetName.toUpperCase().includes('P.M')) continue;

        const worksheet = workbook.Sheets[sheetName];
        const rawJson = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!rawJson || rawJson.length < 5) continue;

        // Tentar encontrar Nome da Máquina
        let nomeMaquina = 'Máquina Desconhecida';
        let tag = 'S/N';
        let idxInicio = 6;

        // Varrer primeiras 10 linhas para achar TAG e Máquina
        for (let i = 0; i < 10; i++) {
          const row = rawJson[i];
          if (!row) continue;
          for (let j = 0; j < row.length; j++) {
            const val = String(row[j] || '').toUpperCase().trim();
            if (val.includes('NOME DA MÁQUINA') || val.includes('NOME DA MQUINA')) {
               // valor geralmente está abaixo
               if (rawJson[i+1] && rawJson[i+1][j]) {
                 nomeMaquina = String(rawJson[i+1][j]).trim();
               } else if (row[j+1]) {
                 nomeMaquina = String(row[j+1]).trim();
               }
            }
            if (val.includes('N.º TAG') || val.includes('TAG')) {
               if (rawJson[i+1] && rawJson[i+1][j]) {
                 tag = String(rawJson[i+1][j]).trim();
               } else if (row[j+1]) {
                 tag = String(row[j+1]).trim();
               }
            }
            if (val === 'O QUE FAZER ?' || val.includes('O QUE FAZER')) {
               idxInicio = i + 2; // começar a varrer 2 linhas abaixo do cabeçalho
            }
          }
        }

        const idMaquina = window.crypto.randomUUID();
        maquinasToInsert.push({
          id: idMaquina,
          tag: tag,
          nome_maquina: nomeMaquina,
          disciplina: sheetName.includes('ELÉT') ? 'ELÉTRICA' : 'MECÂNICA',
          linha: 'GERAL' // Pode ser atualizado se tiver na planilha
        });

        // Varrer as linhas de atividades
        let lastKnown = new Array(15).fill('');

        for (let i = idxInicio; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row) continue;

          let hasLevelValue = false;
          // As colunas de hierarquia vão de A até N (índices 0 a 13)
          for (let col = 0; col <= 13; col++) {
            if (row[col]) {
              lastKnown[col] = String(row[col]).trim();
              hasLevelValue = true;
              // Limpar níveis abaixo
              for (let k = col + 1; k <= 14; k++) {
                lastKnown[k] = '';
              }
            }
          }

          // Procurar atividade (O QUE FAZER) na coluna O (índice 14) ou perto dela
          const oQueFazer = row[14] || row[13] || row[12]; 
          
          // Se tiver O Que Fazer, é uma atividade válida
          if (oQueFazer && String(oQueFazer).trim() !== '') {
             const hierarquia = lastKnown.filter(v => v).join(' > ');
             
             atividadesToInsert.push({
               id: window.crypto.randomUUID(),
               maquina_id: idMaquina,
               hierarquia_sistema: hierarquia,
               o_que_fazer: String(oQueFazer).trim(),
               estrategia: row[15] ? String(row[15]).trim() : '',
               material: row[17] ? String(row[17]).trim() : '',
               hh: row[18] ? parseFloat(String(row[18]).replace(',','.')) : null,
               frequencia: row[19] ? String(row[19]).trim() : ''
             });
          }
        }
      }

      if (maquinasToInsert.length === 0) throw new Error('Nenhuma aba P.M. encontrada ou planilha vazia.');

      toast(`Salvando ${maquinasToInsert.length} máquinas e ${atividadesToInsert.length} atividades...`, 'info');

      // 1. Deletar tudo
      const supabase = getClient();
      await supabase.from('plano_mestre_maquinas').delete().not('id', 'is', null);
      
      // 2. Inserir máquinas
      const { error: errMaq } = await supabase.from('plano_mestre_maquinas').insert(maquinasToInsert);
      if (errMaq) throw errMaq;

      // 3. Inserir atividades em lotes
      for (let i = 0; i < atividadesToInsert.length; i += 100) {
        const batch = atividadesToInsert.slice(i, i + 100);
        const { error: errAtv } = await supabase.from('plano_mestre_atividades').insert(batch);
        if (errAtv) throw errAtv;
      }

      toast('Plano Mestre importado com sucesso!', 'success');
      fileInput.value = '';
      
      // Atualizar UI chamando carregarDados global
      if (window.atualizarPlanoMestreGlobal) {
        window.atualizarPlanoMestreGlobal();
      } else {
        setTimeout(() => window.location.reload(), 1500);
      }

    } catch (err) {
      console.error(err);
      toast(`Erro ao importar: ${err.message}`, 'error');
      fileInput.value = '';
    }
  });
}
