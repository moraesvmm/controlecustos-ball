import fs from 'fs'; const d = JSON.parse(fs.readFileSync('data/rc_principal.json', 'utf8')); console.log(d.slice(0,2));
