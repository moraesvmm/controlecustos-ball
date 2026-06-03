import os

css_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\css\styles.css'

responsive_css = """

/* ==========================================================
   RESPONSIVIDADE - Telas menores (Notebooks e Tablets)
   ========================================================== */
@media (max-width: 1366px) {
  .main-layout { padding: 1rem 2rem 2rem; max-width: 100%; }
  #painel-fixo { padding: 1.5rem 2rem 0; max-width: 100%; }
  .topbar { padding: 1.25rem 2rem; }
  .sidebar { width: 230px !important; }
  .kpi-grid { gap: 0.85rem; }
  .kpi-card { padding: 1rem; }
  .filters { padding: 0.85rem 1rem; gap: 0.65rem; }
}

@media (max-width: 1024px) {
  .main-layout { padding: 1rem 1rem 2rem; }
  #painel-fixo { padding: 1rem 1rem 0; }
  .topbar { padding: 1rem 1rem; }
  .sidebar { width: 200px !important; }
  .sidebar-header h1 { font-size: 1rem !important; }
  .sidebar-nav { padding: 1rem 0.5rem !important; gap: 1rem !important; }
  .kpi-grid { grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  .kpi-wide { grid-column: span 3; }
  .sla-grid { grid-template-columns: repeat(2, 1fr); }
  .filters { gap: 0.5rem; padding: 0.75rem 1rem; }
  .filters label, .filters select, .filters input { min-width: 100px; font-size: 0.8rem; }
  .search-field { min-width: 150px; }
  #view-dashboard.active { grid-template-columns: 1fr; gap: 1rem; }
  .charts-grid { grid-template-columns: 1fr; gap: 1rem; }
  .charts-grid-prazos { grid-template-columns: 1fr; gap: 1rem; }
  .months-grid { gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .month-card { padding: 1rem !important; }
  .month-card-header { font-size: 1rem !important; }
  .crud-chart-section { padding: 0.5rem; }
  .toolbar { padding: 0.75rem 1rem; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  .toolbar-actions { width: 100%; justify-content: flex-start; }
}

@media (max-width: 768px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .kpi-wide { grid-column: span 2; }
  #app-container { flex-direction: column !important; }
  .sidebar { width: 100% !important; height: auto !important; border-right: none !important; border-bottom: 1px solid var(--border); }
  .sidebar-nav { flex-direction: row !important; overflow-x: auto; padding: 0.5rem !important; gap: 0.5rem !important; }
  .sidebar-nav .nav-item { white-space: nowrap; padding: 0.5rem !important; }
  #painel-fixo { position: static; }
  .months-grid { grid-template-columns: repeat(2, 1fr); }
  .form-grid { grid-template-columns: 1fr; }
}
"""

with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

if "RESPONSIVIDADE - Telas menores" not in content:
    with open(css_path, 'a', encoding='utf-8') as f:
        f.write(responsive_css)
    print("Responsive CSS added successfully.")
else:
    print("Responsive CSS already exists.")
