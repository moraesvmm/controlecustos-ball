const xlsx = require('xlsx');

const excelPath = 'C:\\Users\\VMORAES1\\Documents\\ControleHoje.xlsm';
const finPath = 'C:\\Users\\VMORAES1\\Documents\\Financeiro_2406.xlsx';

function test() {
    console.log("=== Lendo ControleHoje.xlsm ===");
    try {
        const wb = xlsx.readFile(excelPath);
        const dash = wb.Sheets['DASHBOARD'];
        if (dash) {
            console.log("AE16: " + (dash['AE16'] ? dash['AE16'].v : 'vazio'));
            console.log("AE17: " + (dash['AE17'] ? dash['AE17'].v : 'vazio'));
            console.log("AF16: " + (dash['AF16'] ? dash['AF16'].v : 'vazio'));
            console.log("AF17: " + (dash['AF17'] ? dash['AF17'].v : 'vazio'));
            
            let total = (dash['AE16']?.v || 0) + (dash['AE17']?.v || 0) + (dash['AF16']?.v || 0) + (dash['AF17']?.v || 0);
            console.log("Total = " + total);
        } else {
            console.log("Aba DASHBOARD nao encontrada.");
        }
        
        const dados = wb.Sheets['DADOS'];
        if (dados) {
            const json = xlsx.utils.sheet_to_json(dados);
            let manutCons = 0;
            let manutServ = 0;
            json.forEach(row => {
                let checkStr = String(row.check || row.CHECK || row.Check || '').toLowerCase().trim();
                let val = Number(row['VALOR'] || row['valor'] || 0);
                if (checkStr === 'manutenção - real consumo') {
                    manutCons += val;
                } else if (checkStr === 'manutenção - real compras serv') {
                    manutServ += val;
                }
            });
            console.log("Manut Consumo (Sheet DADOS) = " + manutCons);
            console.log("Manut Servico (Sheet DADOS) = " + manutServ);
            console.log("Total Manutencao DADOS = " + (manutCons + manutServ));
            
            // Check missing VLOOKUP
            let lost = 0;
            json.forEach(row => {
                 let area = String(row.AREA || row.Area || row.area || '');
                 if (area === '#N/A' || area === 'N/A' || area === '') {
                      lost += Number(row['VALOR'] || row['valor'] || 0);
                 }
            });
            console.log("Lost in #N/A = " + lost);
        }
        
    } catch(e) {
        console.log("Erro lendo ControleHoje: " + e.message);
    }
}
test();
