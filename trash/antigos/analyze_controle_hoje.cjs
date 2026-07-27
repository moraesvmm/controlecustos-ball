const XLSX = require('xlsx');

function analyzeFile() {
  const filePath = 'C:\\Users\\VMORAES1\\Documents\\ControleHoje.xlsm';
  console.log(`Lendo arquivo: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = 'DADOS'; // Assume the main data is in 'DADOS'.
  let sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
      console.log(`Aba DADOS não encontrada.`);
      return;
  }
  
  const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(20, rawJson.length); i++) {
      let rowStr = rawJson[i].map(c => String(c || '').toLowerCase()).join(' ');
      if (rowStr.includes('centro') && rowStr.includes('custo')) {
          headerRowIdx = i;
          break;
      }
  }
  
  if (headerRowIdx === -1) {
      console.log("Não consegui achar o cabeçalho 'Centro de Custo'.");
      return;
  }
  
  const headers = rawJson[headerRowIdx];
  let centroCustoIdx = -1;
  let auIdx = 46; // Column AU is index 46 (A=0, Z=25, AA=26, AU=46)
  
  for (let i = 0; i < headers.length; i++) {
      let h = String(headers[i] || '').toLowerCase().trim();
      if (h.includes('centro') && h.includes('custo')) {
          centroCustoIdx = i;
      }
  }
  
  console.log(`Encontrado 'Centro de Custo' na coluna índice: ${centroCustoIdx} (Cabeçalho: ${headers[centroCustoIdx]})`);
  console.log(`A coluna AU (índice 46) tem o cabeçalho: ${headers[auIdx]}`);
  
  let totalAU = 0;
  let countManut = 0;
  
  for (let i = headerRowIdx + 1; i < rawJson.length; i++) {
      const row = rawJson[i];
      if (!row || row.length === 0) continue;
      
      const centroCusto = String(row[centroCustoIdx] || '').toLowerCase().trim();
      if (centroCusto.includes('manutenção') || centroCusto.includes('manutencao')) {
          countManut++;
          let valAU = row[auIdx];
          
          if (typeof valAU === 'number') {
              totalAU += valAU;
          } else if (typeof valAU === 'string') {
              let parsed = parseFloat(valAU.replace(/\./g, '').replace(',', '.'));
              if (!isNaN(parsed)) {
                  totalAU += parsed;
              }
          }
      }
  }
  
  console.log(`Total de linhas Manutenção encontradas: ${countManut}`);
  console.log(`Soma da coluna AU para Manutenção: R$ ${totalAU.toFixed(2)}`);
}

analyzeFile();
