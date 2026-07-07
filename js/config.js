export const SUPABASE_URL = window.__ENV?.SUPABASE_URL || 'http://localhost:8080';
export const SUPABASE_ANON_KEY =
  window.__ENV?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphd2xjZ3Vyb3dzcXJ5ZHdmaXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAyMzEsImV4cCI6MjA5NzM2NjIzMX0.2UQOL_ig7HKHp0jpXrJGff08Ur6G-ivauHTxH7ijwYs';

export const USE_LOCAL_DATA = window.__ENV?.USE_LOCAL_DATA !== 'false';

// Integração GitHub Actions para disparo do modelo preditivo noturno
// Gere em: github.com → Settings → Developer settings → Personal access tokens → Fine-grained
// Permissão necessária: Actions (Read and Write) no repo controlecustos-ball
export const GITHUB_PAT          = window.__ENV?.GITHUB_PAT          || '';
export const GITHUB_REPO_OWNER   = 'moraesvmm';
export const GITHUB_REPO_NAME    = 'controlecustos-ball';
export const GITHUB_WORKFLOW_ID  = 'daily_forecast.yml';
