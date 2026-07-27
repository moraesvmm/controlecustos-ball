const xlsx = require('\\\\britufps01\\group\\Manutenção\\25 - SISTEMA CONTROLE DE CUSTOS\\controle-rc-system\\node_modules\\xlsx');

const excelPath = 'C:\\Users\\VMORAES1\\Documents\\ControleHoje.xlsm';

console.log("=== Lendo ControleHoje.xlsm ===");
try {
    const wb = xlsx.readFile(excelPath);
    
    const dados = wb.Sheets['DADOS'];
    if (dados) {
        const json = xlsx.utils.sheet_to_json(dados);
        let lostItems = [];
        let lostSum = 0;
        
        json.forEach((row, i) => {
             // A formula do Excel VLOOKUP preenche a Area ou Check. 
             // Se falhou, geralmente fica #N/A na coluna AREA ou na coluna CHECK.
             let area = String(row.AREA || row.Area || row.area || '').trim();
             let checkStr = String(row.check || row.CHECK || row.Check || '').trim();
             let val = Number(row['VALOR'] || row['valor'] || 0);
             
             // Só nos importam itens que tem valor financeiro (custo)
             if (val !== 0) {
                 if (area === '#N/A' || area === 'N/A' || checkStr === '#N/A' || checkStr === 'N/A') {
                      lostItems.push({
                          linhaExcel: i + 2, // header is 1
                          ordem: row['NR-ORD-PRODU'] || row['nr-ord-produ'] || row['ordem'],
                          item: row['IT-CODIGO'] || row['it-codigo'] || row['item'],
                          descricao: row['DESCRIÇÃO CODIGO'] || row['descricao codigo'],
                          valor: val
                      });
                      lostSum += val;
                 }
             }
        });
        
        console.log(`Encontrados ${lostItems.length} itens perdidos pelo Excel (VLOOKUP retornou #N/A). Total perdido: R$ ${lostSum.toFixed(2)}`);
        console.log("Itens perdidos:");
        lostItems.forEach(item => {
            console.log(`Ordem: ${item.ordem} | Item: ${item.item} | Desc: ${item.descricao} | Valor: R$ ${item.valor}`);
        });
        
    } else {
        console.log("Aba DASHBOARD nao encontrada.");
    }
    
} catch(e) {
    console.log("Erro lendo ControleHoje: " + e.message);
}
