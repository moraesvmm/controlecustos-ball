/**
 * Gera js/env.runtime.js a partir das variáveis de ambiente (Vercel / CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://nnbzcukmuziyrobdqlnh.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  USE_LOCAL_DATA: process.env.USE_LOCAL_DATA || 'false',
};

if (!env.SUPABASE_ANON_KEY) {
  console.warn('AVISO: SUPABASE_ANON_KEY não definida. Configure na Vercel (Settings → Environment Variables).');
}

const content = `// Gerado automaticamente — não editar
window.__ENV = ${JSON.stringify(env, null, 2)};
`;

const out = path.join(root, 'js', 'env.runtime.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, content, 'utf8');
console.log('OK: js/env.runtime.js');
