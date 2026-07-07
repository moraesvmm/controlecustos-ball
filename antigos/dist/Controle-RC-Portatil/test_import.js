const XLSX = require('xlsx');
const fs = require('fs');

const file = fs.readFileSync('C:/Users/VMORAES1/Downloads/CONTROLE RC (2).xlsx');
const wb = XLSX.read(file, {type: 'buffer'});
const ws = wb.Sheets['Planilha1'];
const json = XLSX.utils.sheet_to_json(ws, {defval: null});

console.log('Rows:', json.length);
console.log(json[0]);
