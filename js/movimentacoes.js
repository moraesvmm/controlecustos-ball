/**
 * MÓDULO INTELIGÊNCIA FINANCEIRA: Movimentações e Custo Geral
 * Script responsável pela lógica das views "Custo Geral" e "Movimentações"
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // Elementos - View Dashboard
    const btnUploadMovimentacoes = document.getElementById('btnUploadMovimentacoes');
    const fileImportMovimentacoes = document.getElementById('fileImportMovimentacoes');
    
    // KPIs
    const kpiBudget = document.getElementById('movKpiBudget');
    const kpiConsumido = document.getElementById('movKpiConsumido');
    const kpiUtilizacao = document.getElementById('movKpiUtilizacao');
    const kpiUtilizacaoBar = document.getElementById('movKpiUtilizacaoBar');
    const kpiStatus = document.getElementById('movKpiStatus');
    const areaList = document.getElementById('movAreaList');

    // Elementos - View Grid
    const movTableGridBody = document.getElementById('movTableGridBody');
    const movFiltroBusca = document.getElementById('movFiltroBusca');
    const movFiltroAno = document.getElementById('movFiltroAno');
    const movFiltroMes = document.getElementById('movFiltroMes');
    const movFiltroArea = document.getElementById('movFiltroArea');
    const movGridVisiveis = document.getElementById('movGridVisiveis');
    const movGridTotal = document.getElementById('movGridTotal');
    const movGridSomaValor = document.getElementById('movGridSomaValor');
    const btnMovExportarCsv = document.getElementById('btnMovExportarCsv');
    
    // Paginacao
    const btnPrev = document.getElementById('movBtnPrevPage');
    const btnNext = document.getElementById('movBtnNextPage');
    let currentPage = 1;
    const limit = 100;
    
    // Echarts Instancias
    let chartEvolucao = null;
    if(document.getElementById('chartMovEvolucao') && typeof echarts !== 'undefined') {
        chartEvolucao = echarts.init(document.getElementById('chartMovEvolucao'));
        window.addEventListener('resize', () => chartEvolucao.resize());
    }

    // Formatadores
    const formatBRL = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // ==========================================
    // 1. LÓGICA DE UPLOAD
    // ==========================================
    if (btnUploadMovimentacoes && fileImportMovimentacoes) {
        btnUploadMovimentacoes.addEventListener('click', () => fileImportMovimentacoes.click());
        
        fileImportMovimentacoes.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Feedback visual
            const originalText = btnUploadMovimentacoes.innerHTML;
            btnUploadMovimentacoes.innerHTML = '⏳ Processando (isso pode levar alguns segundos)...';
            btnUploadMovimentacoes.disabled = true;
            
            try {
                // SweetAlert de carregamento (se houver no sistema)
                if(window.Swal) {
                    Swal.fire({
                        title: 'Importando Custos',
                        text: 'Lendo as abas DADOS e Custo Geral - Movimentação. Aguarde...',
                        allowOutsideClick: false,
                        didOpen: () => Swal.showLoading()
                    });
                }

                const formData = new FormData();
                formData.append('file', file);
                
                const url = (window.__ENV && window.__ENV.SUPABASE_URL) ? `${window.__ENV.SUPABASE_URL}/api/movimentacoes/import` : 'http://localhost:8080/api/movimentacoes/import';

                const response = await fetch(url, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || 'Falha na importação do arquivo.');
                }

                const data = await response.json();
                
                if(window.Swal) {
                    Swal.fire('Sucesso!', `Dados de ${data.mes}/${data.ano} importados com sucesso.`, 'success');
                } else {
                    alert('Dados importados com sucesso!');
                }

                // Recarrega os dados nas duas telas
                loadDashboard();
                loadGrid(1);

            } catch (err) {
                console.error(err);
                if(window.Swal) {
                    Swal.fire('Erro!', err.message, 'error');
                } else {
                    alert('Erro: ' + err.message);
                }
            } finally {
                btnUploadMovimentacoes.innerHTML = originalText;
                btnUploadMovimentacoes.disabled = false;
                fileImportMovimentacoes.value = '';
            }
        });
    }

    // ==========================================
    // 2. DASHBOARD VIEW (CUSTO GERAL)
    // ==========================================
    async function loadDashboard() {
        const dashboardView = document.getElementById('view-movimentacoes-dashboard');
        // Só carrega se a tela estiver visível ou pra forçar
        if(dashboardView.style.display === 'none') return;
        
        try {
            const url = (window.__ENV && window.__ENV.SUPABASE_URL) ? `${window.__ENV.SUPABASE_URL}/api/movimentacoes/dashboard` : 'http://localhost:8080/api/movimentacoes/dashboard';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Erro ao buscar dados do dashboard.');
            const data = await res.json();
            
            // Renderiza KPIs
            renderDashboard(data.timeline, data.raw_summary);
        } catch(err) {
            console.error(err);
        }
    }

    let chartUtilizacaoInstance = null;
    let sparklineBudgetInstance = null;
    let sparklineConsumoInstance = null;
    let chartAreasInstance = null;

    function renderDashboard(timeline, raw_summary) {
        if (!timeline || timeline.length === 0) return;
        
        window.lastTimelineMov = timeline; // Export to allow toggles to recalculate
        
        const ultimoMes = timeline[timeline.length - 1];
        const penultimoMes = timeline.length > 1 ? timeline[timeline.length - 2] : null;

        // --- 1. Consolidação Motor (Foco: Manutenção) ---
        let consumoManutencao = 0;
        let budgetManutencao = 0;
        let hasBudgetArea = false;

        if (raw_summary) {
            raw_summary.forEach(r => {
                if (r.mes === ultimoMes.mes && r.ano === ultimoMes.ano) {
                    if (r.area_id && r.area_id.toUpperCase().includes('MANUTEN')) {
                        consumoManutencao += (r.consumo_realizado || 0);
                        let areaBudget = r.meta_mensal !== undefined ? r.meta_mensal : (r.budget_total !== undefined ? r.budget_total : undefined);
                        if (areaBudget !== undefined) {
                            budgetManutencao += areaBudget;
                            hasBudgetArea = true;
                        }
                    }
                }
            });
        }

        if (!hasBudgetArea || budgetManutencao === 0) {
            budgetManutencao = ultimoMes.budget;
        }

        const percManutencao = budgetManutencao > 0 ? (consumoManutencao / budgetManutencao) * 100 : 0;
        
        // --- 2. Lógica de Pacing (Run Rate): Projeção de fechamento ---
        let projectedPerc = percManutencao;
        const today = new Date();
        
        if (ultimoMes.mes === (today.getMonth() + 1) && ultimoMes.ano === today.getFullYear()) {
            const currentDay = today.getDate();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            
            if (currentDay > 0 && currentDay <= daysInMonth) {
                const runRate = consumoManutencao / currentDay;
                const projectedConsumption = runRate * daysInMonth;
                projectedPerc = budgetManutencao > 0 ? (projectedConsumption / budgetManutencao) * 100 : 0;
            }
        }

        let healthScore = 100;
        let healthLabel = '';
        let healthColor = '';
        let healthInsight = '';
        let healthTrend = '↑ Estável';
        let trendColor = '#a1a1aa';

        if (projectedPerc <= 90) {
            healthScore = Math.round(100 - (projectedPerc / 90) * 5); // 95-100
            healthLabel = 'Excelente';
            healthColor = '#10b981'; // Emerald
            healthInsight = `Projeção de fechamento: ${projectedPerc.toFixed(1)}%. Ritmo de consumo da manutenção (Run Rate) indica folga operacional.`;
            healthTrend = '↑ Otimizado';
            trendColor = '#10b981';
        } else if (projectedPerc <= 98) {
            healthScore = Math.round(94 - ((projectedPerc - 90) / 8) * 14); // 80-94
            healthLabel = 'Baixo Risco';
            healthColor = '#3b82f6'; // Blue
            healthInsight = `Projeção de fechamento: ${projectedPerc.toFixed(1)}%. Consumo da manutenção dentro do pace esperado.`;
            healthTrend = '→ Estável';
            trendColor = '#3b82f6';
        } else if (projectedPerc <= 105) {
            healthScore = Math.round(79 - ((projectedPerc - 98) / 7) * 19); // 60-79
            healthLabel = 'Atenção';
            healthColor = '#f59e0b'; // Amber
            healthInsight = `Projeção de fechamento: ${projectedPerc.toFixed(1)}%. O ritmo atual (Burn Rate) aponta leve estouro de manutenção no fechamento do mês.`;
            healthTrend = '↓ Declínio leve';
            trendColor = '#f59e0b';
        } else if (projectedPerc <= 115) {
            healthScore = Math.round(59 - ((projectedPerc - 105) / 10) * 19); // 40-59
            healthLabel = 'Risco Moderado';
            healthColor = '#f97316'; // Orange
            healthInsight = `Projeção de fechamento: ${projectedPerc.toFixed(1)}%. O teto de manutenção será ultrapassado se ordens de serviço não forem contidas.`;
            healthTrend = '↓ Instável';
            trendColor = '#f97316';
        } else {
            healthScore = Math.max(0, Math.round(39 - ((projectedPerc - 115) / 35) * 39)); // 0-39
            healthLabel = 'Risco Alto';
            healthColor = '#ef4444'; // Red
            healthInsight = `Alerta crítico fabril! Projeção aponta fechamento em ${projectedPerc.toFixed(1)}%. Estouro massivo de manutenção esperado se o ritmo continuar.`;
            healthTrend = '↓ Crítico';
            trendColor = '#ef4444';
        }

        // --- 3. Insights Banner ---
        let insightsHTML = `<span>No mês vigente (<strong>${ultimoMes.mes.toString().padStart(2, '0')}/${ultimoMes.ano}</strong>), o consumo registrado da Manutenção é de <strong>${formatBRL(consumoManutencao)}</strong>.</span>`;
        
        if (budgetManutencao > 0) {
            insightsHTML += `<span>Isso representa <strong>${percManutencao.toFixed(1)}%</strong> do budget disponível da manutenção.</span>`;
        }
        
        if (projectedPerc > 100) {
            insightsHTML += `<span style="color: var(--danger, #ef4444); font-weight: 600;">Risco atual: Estouro orçamentário previsto. ${healthInsight}</span>`;
        } else if (projectedPerc > 90) {
            insightsHTML += `<span style="color: var(--warning, #f59e0b); font-weight: 600;">Risco atual: Consumo próximo ao teto mensal.</span>`;
        } else {
            insightsHTML += `<span style="color: var(--success, #10b981); font-weight: 600;">Risco atual: Consumo de manutenção controlado.</span>`;
        }
        
        document.getElementById('movInsightsText').innerHTML = insightsHTML;
        document.getElementById('movInsightsBanner').style.display = 'flex';

        // --- 4. KPIs Básicos ---
        document.getElementById('movKpiBudget').innerText = formatBRL(ultimoMes.budget);
        document.getElementById('movKpiConsumido').innerText = formatBRL(ultimoMes.consumo);

        if (penultimoMes) {
            const varBudget = penultimoMes.budget > 0 ? ((ultimoMes.budget - penultimoMes.budget) / penultimoMes.budget) * 100 : 0;
            const varConsumo = penultimoMes.consumo > 0 ? ((ultimoMes.consumo - penultimoMes.consumo) / penultimoMes.consumo) * 100 : 0;
            
            document.getElementById('movKpiBudgetTrend').innerHTML = `<span style="color: ${varBudget >= 0 ? 'var(--success)' : 'var(--muted)'};">${varBudget >= 0 ? '↑' : '↓'} ${Math.abs(varBudget).toFixed(1)}%</span> vs mês anterior`;
            document.getElementById('movKpiConsumoTrend').innerHTML = `<span style="color: ${varConsumo > 0 ? 'var(--error)' : 'var(--success)'};">${varConsumo > 0 ? '↑' : '↓'} ${Math.abs(varConsumo).toFixed(1)}%</span> vs mês anterior`;
        }

        // --- 5. Sparklines ---
        const sparklineOptions = (data, color, areaColor) => ({
            grid: { left: 0, right: 0, top: 5, bottom: 0 },
            xAxis: { type: 'category', show: false },
            yAxis: { type: 'value', show: false, min: 'dataMin' },
            series: [{
                data: data, type: 'line', smooth: true, symbol: 'none',
                lineStyle: { color: color, width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: areaColor },
                        { offset: 1, color: 'rgba(0,0,0,0)' }
                    ])
                }
            }]
        });

        if(!sparklineBudgetInstance) sparklineBudgetInstance = echarts.init(document.getElementById('sparklineBudget'));
        sparklineBudgetInstance.setOption(sparklineOptions(timeline.map(t => t.budget), '#a1a1aa', 'rgba(161, 161, 170, 0.2)'));

        if(!sparklineConsumoInstance) sparklineConsumoInstance = echarts.init(document.getElementById('sparklineConsumo'));
        sparklineConsumoInstance.setOption(sparklineOptions(timeline.map(t => t.consumo), '#2563eb', 'rgba(37, 99, 235, 0.2)'));

        // --- 6. Gauge Chart (Utilização Geral) ---
        let percGeral = ultimoMes.budget > 0 ? (ultimoMes.consumo / ultimoMes.budget) * 100 : 0;
        document.getElementById('movKpiUtilizacaoText').innerText = `${percGeral.toFixed(1)}%`;
        
        let utilGaugeColor = '#10b981';
        if (percGeral > 100) utilGaugeColor = '#ef4444';
        else if (percGeral > 85) utilGaugeColor = '#f59e0b';

        if(!chartUtilizacaoInstance) chartUtilizacaoInstance = echarts.init(document.getElementById('chartUtilizacao'));
        chartUtilizacaoInstance.setOption({
            series: [{
                type: 'gauge', startAngle: 90, endAngle: -270,
                pointer: { show: false }, 
                progress: { 
                    show: true, overlap: false, roundCap: true, clip: false, 
                    itemStyle: { color: utilGaugeColor, shadowBlur: 10, shadowColor: utilGaugeColor + '66' } 
                },
                axisLine: { lineStyle: { width: 6, color: [[1, 'rgba(255,255,255,0.05)']] } },
                splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
                data: [{ value: Math.min(percGeral, 100), itemStyle: { color: utilGaugeColor } }],
                detail: { show: false }
            }]
        });

        // --- 7. Health Score Orçamentário Visual ---
        document.getElementById('healthScoreValue').innerText = healthScore;
        document.getElementById('healthScoreValue').style.color = healthColor;
        document.getElementById('healthScoreLabel').innerText = healthLabel;
        document.getElementById('healthScoreLabel').style.color = healthColor;
        document.getElementById('healthScoreTrend').innerHTML = `<span style="color: ${trendColor}; font-weight: 600;">${healthTrend}</span> <span style="opacity: 0.7; font-size: 0.7rem;">Confiança: 94%</span>`;
        document.getElementById('healthScoreInsight').innerText = healthInsight;

        if(!window.chartHealthScoreInstance) window.chartHealthScoreInstance = echarts.init(document.getElementById('chartHealthScore'));
        window.chartHealthScoreInstance.setOption({
            series: [{
                type: 'gauge', startAngle: 90, endAngle: -270,
                radius: '85%', center: ['45%', '50%'],
                pointer: { show: false }, 
                progress: { 
                    show: true, overlap: false, roundCap: true, clip: false, 
                    itemStyle: { color: healthColor, shadowBlur: 10, shadowColor: healthColor + '88' } 
                },
                axisLine: { lineStyle: { width: 5, color: [[1, 'rgba(255,255,255,0.05)']] } },
                splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
                data: [{ value: healthScore, itemStyle: { color: healthColor } }],
                detail: { show: false }
            }],
            color: [healthColor] // Forçar cor no ECharts
        }, true); // Adicionar "true" limpa propriedades residuais do echarts


        // --- 5. Master Evolution Chart ---
        const labels = timeline.map(t => `${t.mes.toString().padStart(2, '0')}/${t.ano}`);
        const dataBudget = timeline.map(t => t.budget);
        const dataConsumo = timeline.map(t => t.consumo);
        
        if(chartEvolucao) {
            chartEvolucao.setOption({
                tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(9, 14, 23, 0.95)',
                borderColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderRadius: 10,
                padding: [12, 16],
                textStyle: { color: '#f1f5f9', fontSize: 13, fontFamily: 'DM Sans, sans-serif' },
                axisPointer: { type: 'cross', crossStyle: { color: 'rgba(255,255,255,0.15)', width: 1 }, lineStyle: { color: 'rgba(212,175,55,0.3)', width: 1, type: 'dashed' } },
                extraCssText: 'box-shadow: 0 16px 40px rgba(0,0,0,0.6); backdrop-filter: blur(12px);',
                    formatter: function(params) {
                        let html = `<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 8px;">
                                        <strong style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Referência: ${params[0].axisValue}</strong>
                                    </div>`;
                        params.forEach(p => {
                            html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;gap:32px;">
                                        <span style="display:flex;align-items:center;gap:6px;">${p.marker} <span style="color:#e4e4e7">${p.seriesName}</span></span>
                                        <strong style="font-family:'DM Sans', monospace; font-size: 14px;">${formatBRL(p.value)}</strong>
                                     </div>`;
                        });
                        return html;
                    }
                },
                toolbox: {
                    show: true,
                    feature: {
                        dataZoom: { yAxisIndex: 'none' },
                        magicType: { type: ['line', 'bar', 'stack'] },
                        saveAsImage: {}
                    },
                    iconStyle: { borderColor: '#71717a' }
                },
                legend: { data: ['Budget', 'Consumo Realizado'], textStyle: { color: '#a1a1aa', fontFamily: 'Inter' }, icon: 'circle', itemWidth: 8, itemHeight: 8, bottom: 0 },
                grid: { left: '2%', right: '4%', bottom: '18%', top: '15%', containLabel: true },
                dataZoom: [
                    { type: 'inside', start: 0, end: 100 },
                    { start: 0, end: 100, height: 24, bottom: 30, borderColor: 'transparent', fillerColor: 'rgba(37,99,235,0.2)', handleStyle: { color: '#2563eb' }, textStyle: { color: '#71717a' } }
                ],
                xAxis: { type: 'category', data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#71717a', fontFamily: 'Inter', margin: 12 } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)', type: 'dashed' } }, axisLabel: { color: '#71717a', fontFamily: 'Inter', formatter: (val) => 'R$ ' + (val/1000) + 'k' } },
                series: [
                    { 
                        name: 'Budget', type: 'line', smooth: true, itemStyle: { color: '#a1a1aa' }, symbol: 'none', 
                        lineStyle: { width: 2, type: 'dashed' }, data: dataBudget, universalTransition: true 
                    },
                    { 
                      name: 'Consumo Realizado', type: 'bar', smooth: true, universalTransition: true,
                      itemStyle: { 
                          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: '#2563eb'}, {offset: 1, color: 'rgba(37, 99, 235, 0.1)'}]), 
                          borderRadius: [4, 4, 0, 0],
                          shadowBlur: 10, shadowColor: 'rgba(37, 99, 235, 0.2)' 
                      }, 
                      barMaxWidth: 40, data: dataConsumo,
                      markPoint: {
                          data: [
                              { type: 'max', name: 'Máximo', itemStyle: { color: '#ef4444' } },
                              { type: 'min', name: 'Mínimo', itemStyle: { color: '#10b981' } }
                          ],
                          label: { color: '#fff', fontSize: 10, formatter: (p) => formatBRL(p.value).replace('R$ ','') }
                      }
                    }
                ]
            });
        }

        // Expor controle de transição globalmente para os botões do HTML
        window.setChartMode = function(mode) {
            if (!chartEvolucao) return;
            
            // Atualizar botões visuais
            document.querySelectorAll('.btn-chart-mode').forEach(btn => {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--muted)';
                btn.style.border = '1px solid transparent';
            });
            
            let activeBtn = document.getElementById(mode === 'bar' ? 'btnModeBar' : mode === 'area' ? 'btnModeArea' : 'btnModeTrend');
            if(activeBtn) {
                activeBtn.style.background = 'rgba(37,99,235,0.2)';
                activeBtn.style.color = '#60a5fa';
                activeBtn.style.border = '1px solid rgba(37,99,235,0.3)';
            }

            const currentOption = chartEvolucao.getOption();
            const seriesConsumo = currentOption.series[1];

            if (mode === 'bar') {
                seriesConsumo.type = 'bar';
                seriesConsumo.areaStyle = null;
            } else if (mode === 'area') {
                seriesConsumo.type = 'line';
                seriesConsumo.areaStyle = {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(37, 99, 235, 0.4)'}, {offset: 1, color: 'rgba(37, 99, 235, 0.0)'}])
                };
            } else if (mode === 'trend') {
                seriesConsumo.type = 'line';
                seriesConsumo.areaStyle = null;
            }

            chartEvolucao.setOption({ series: [currentOption.series[0], seriesConsumo] }, { replaceMerge: ['series'] });
        };

        // --- 6. Nightingale Rose Chart (Substituindo as Barras de Áreas) ---
        if(!chartAreasInstance) chartAreasInstance = echarts.init(document.getElementById('chartMovAreas'));
        const areaMap = {};
        
        raw_summary.forEach(r => {
            if (r.mes === ultimoMes.mes && r.ano === ultimoMes.ano) {
                if(!areaMap[r.area_id]) areaMap[r.area_id] = 0;
                areaMap[r.area_id] += r.consumo_realizado;
            }
        });

        const polarData = Object.keys(areaMap).map(k => ({ name: k, value: areaMap[k] })).sort((a,b) => b.value - a.value);

        chartAreasInstance.setOption({
            tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(9, 14, 23, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderRadius: 10,
            padding: [12, 16],
            textStyle: { color: '#f1f5f9', fontSize: 13, fontFamily: 'DM Sans, sans-serif' },
            axisPointer: { type: 'cross', crossStyle: { color: 'rgba(255,255,255,0.15)', width: 1 }, lineStyle: { color: 'rgba(212,175,55,0.3)', width: 1, type: 'dashed' } },
            extraCssText: 'box-shadow: 0 16px 40px rgba(0,0,0,0.6); backdrop-filter: blur(12px);',
                formatter: p => `<strong style="color:#60a5fa">${p.name}</strong><br/>${formatBRL(p.value)} (${p.percent}%)`
            },
            legend: {
                bottom: '0%', textStyle: { color: '#a1a1aa', fontFamily: 'Inter', fontSize: 11 },
                icon: 'circle', itemWidth: 8, itemHeight: 8, type: 'scroll'
            },
            series: [{
                name: 'Consumo por Área',
                type: 'pie',
                radius: ['20%', '70%'],
                center: ['50%', '45%'],
                roseType: 'area',
                itemStyle: {
                    borderRadius: 8,
                    borderColor: 'rgba(0,0,0,0.5)',
                    borderWidth: 2
                },
                label: {
                    color: '#e4e4e7', fontFamily: 'Inter',
                    formatter: '{b}\n{d}%'
                },
                data: polarData,
                color: [
                    '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'
                ] // Paleta monocromática de azuis Premium
            }]
        });

        // Título dinâmico
        const titleEl = document.getElementById('movAreaListTitle');
        if (titleEl) titleEl.innerText = `Distribuição de Consumo (${ultimoMes.mes.toString().padStart(2, '0')}/${ultimoMes.ano})`;

        // Resize
        window.addEventListener('resize', () => {
            if(sparklineBudgetInstance) sparklineBudgetInstance.resize();
            if(sparklineConsumoInstance) sparklineConsumoInstance.resize();
            if(chartUtilizacaoInstance) chartUtilizacaoInstance.resize();
            if(chartEvolucao) chartEvolucao.resize();
            if(chartAreasInstance) chartAreasInstance.resize();
            if(window.chartHealthScoreInstance) window.chartHealthScoreInstance.resize();
        });
    }

    // ==========================================
    // 3. GRID VIEW (TRANSACOES)
    // ==========================================
    async function loadGrid(page = 1) {
        const gridView = document.getElementById('view-movimentacoes-grid');
        if(gridView.style.display === 'none') return;
        
        currentPage = page;
        const offset = (currentPage - 1) * limit;
        
        const qAno = movFiltroAno.value;
        const qMes = movFiltroMes.value;
        const qArea = movFiltroArea.value;

        let urlStr = (window.__ENV && window.__ENV.SUPABASE_URL) ? `${window.__ENV.SUPABASE_URL}/api/movimentacoes/grid?limite=${limit}&offset=${offset}` : `http://localhost:8080/api/movimentacoes/grid?limite=${limit}&offset=${offset}`;
        if(qAno) urlStr += `&ano=${qAno}`;
        if(qMes) urlStr += `&mes=${qMes}`;

        try {
            const res = await fetch(urlStr);
            if (!res.ok) throw new Error('Erro ao buscar grid');
            const data = await res.json();
            
            // Busca local para filtros textuais
            let rows = data.data;
            const qBusca = movFiltroBusca.value.toLowerCase();
            
            if (qBusca || qArea) {
                rows = rows.filter(r => {
                    let textMatches = true;
                    if(qBusca) {
                        const str = `${r.codigo_item} ${r.descricao} ${r.collaborator_id} ${r.area_id}`.toLowerCase();
                        textMatches = str.includes(qBusca);
                    }
                    let areaMatches = true;
                    if(qArea) {
                        areaMatches = r.area_id === qArea;
                    }
                    return textMatches && areaMatches;
                });
            }

            // Renderiza
            movTableGridBody.innerHTML = '';
            let somaFiltro = 0;
            
            rows.forEach(r => {
                somaFiltro += r.valor_total || 0;
                
                const tr = document.createElement('tr');
                tr.style.transition = 'background-color 0.2s';
                tr.onmouseover = () => tr.style.backgroundColor = 'rgba(255,255,255,0.02)';
                tr.onmouseout = () => tr.style.backgroundColor = 'transparent';
                tr.innerHTML = `
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--muted);">${r.data_transacao}</td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--text); font-family: 'DM Sans', monospace;">${r.codigo_item || '-'}</td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--text); font-weight: 500;" title="${r.descricao || ''}">${(r.descricao || '').substring(0,50)}</td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--muted);"><span style="background: var(--bg); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.75rem; border: 1px solid var(--border);">${r.area_id || '-'}</span></td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--muted);">${r.cost_center_id || '-'}</td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--text); font-family: 'DM Sans', monospace; font-weight: 600; text-align: right;">${formatBRL(r.valor_total || 0)}</td>
                    <td style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); color: var(--muted);">${r.collaborator_id || '-'}</td>
                `;
                movTableGridBody.appendChild(tr);
            });

            if(rows.length === 0) {
                movTableGridBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum registro encontrado.</td></tr>`;
            }

            movGridSomaValor.innerText = formatBRL(somaFiltro);
            movGridVisiveis.innerText = rows.length;
            movGridTotal.innerText = data.total;
            
            btnPrev.disabled = (currentPage === 1);
            btnNext.disabled = ((offset + limit) >= data.total);

        } catch (err) {
            console.error(err);
        }
    }

    // Handlers
    const btnMovViewMensal = document.getElementById('btnMovViewMensal');
    const btnMovViewAcumulado = document.getElementById('btnMovViewAcumulado');

    if (btnMovViewMensal && btnMovViewAcumulado) {
        const setViewMode = (mode) => {
            if (!chartEvolucao || !window.lastTimelineMov) return;
            const timeline = window.lastTimelineMov;
            const labels = timeline.map(t => `${t.mes.toString().padStart(2, '0')}/${t.ano}`);
            let dataBudget = [];
            let dataConsumo = [];

            if (mode === 'acumulado') {
                btnMovViewAcumulado.style.background = 'var(--surface-solid)';
                btnMovViewAcumulado.style.color = 'var(--text)';
                btnMovViewAcumulado.style.border = '1px solid var(--border)';
                btnMovViewAcumulado.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                
                btnMovViewMensal.style.background = 'transparent';
                btnMovViewMensal.style.color = 'var(--muted)';
                btnMovViewMensal.style.border = 'none';
                btnMovViewMensal.style.boxShadow = 'none';

                let sumB = 0, sumC = 0;
                timeline.forEach(t => {
                    sumB += t.budget; sumC += t.consumo;
                    dataBudget.push(sumB); dataConsumo.push(sumC);
                });
            } else {
                btnMovViewMensal.style.background = 'var(--surface-solid)';
                btnMovViewMensal.style.color = 'var(--text)';
                btnMovViewMensal.style.border = '1px solid var(--border)';
                btnMovViewMensal.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                
                btnMovViewAcumulado.style.background = 'transparent';
                btnMovViewAcumulado.style.color = 'var(--muted)';
                btnMovViewAcumulado.style.border = 'none';
                btnMovViewAcumulado.style.boxShadow = 'none';

                dataBudget = timeline.map(t => t.budget);
                dataConsumo = timeline.map(t => t.consumo);
            }

            chartEvolucao.setOption({
                series: [
                    { data: dataBudget },
                    { data: dataConsumo, type: mode === 'acumulado' ? 'line' : 'bar', areaStyle: mode === 'acumulado' ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(37, 99, 235, 0.3)'}, {offset: 1, color: 'rgba(37, 99, 235, 0.0)'}]) } : null }
                ]
            });
        };

        btnMovViewMensal.addEventListener('click', () => setViewMode('mensal'));
        btnMovViewAcumulado.addEventListener('click', () => setViewMode('acumulado'));
    }

    [movFiltroBusca, movFiltroAno, movFiltroMes, movFiltroArea].forEach(el => {
        if(el) {
            el.addEventListener('change', () => loadGrid(1));
            if(el.tagName === 'INPUT') el.addEventListener('keyup', (e) => { if(e.key === 'Enter') loadGrid(1); });
        }
    });

    if (btnPrev) btnPrev.addEventListener('click', () => loadGrid(currentPage - 1));
    if (btnNext) btnNext.addEventListener('click', () => loadGrid(currentPage + 1));
    
    // Exportar CSV
    if(btnMovExportarCsv) {
        btnMovExportarCsv.addEventListener('click', () => {
            const table = document.getElementById('movTableGrid');
            if(!table) return;
            const rows = Array.from(table.querySelectorAll('tr'));
            const csv = rows.map(r => Array.from(r.querySelectorAll('th,td')).map(c => '"' + c.innerText.replace(/"/g, '""') + '"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "movimentacoes.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
    
    // Interceptar cliques no menu de abas principal para carregar os dados correspondentes
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab="movimentacoes-dashboard"]')) {
            setTimeout(loadDashboard, 100);
            if(chartEvolucao) setTimeout(() => chartEvolucao.resize(), 200);
        }
        if (e.target.closest('[data-tab="movimentacoes-grid"]')) {
            setTimeout(() => loadGrid(1), 100);
        }
    });

    window.addEventListener('themeChanged', () => {
        if (document.getElementById('view-movimentacoes-dashboard').style.display !== 'none') {
            loadDashboard();
        }
    });

    // ==========================================
    // LÓGICA DO MODAL DE NOVIDADES
    // ==========================================
    const btnMovNovidades = document.getElementById('btnMovNovidades');
    const novidadesModalOverlay = document.getElementById('novidadesModalOverlay');
    const btnNovidadesClose = document.getElementById('btnNovidadesClose');
    const novTableBody = document.getElementById('novTableBody');
    const novFiltroBusca = document.getElementById('novFiltroBusca');
    const btnNovExportarCsv = document.getElementById('btnNovExportarCsv');
    
    let currentNovidadesData = [];

    // Função para verificar se existem novidades (pode ser chamada após importar)
    async function checkNovidades() {
        if(!btnMovNovidades) return;
        try {
            const url = (window.__ENV && window.__ENV.SUPABASE_URL) ? `${window.__ENV.SUPABASE_URL}/api/movimentacoes/novidades` : 'http://localhost:8080/api/movimentacoes/novidades';
            const res = await fetch(url);
            if(res.ok) {
                const data = await res.json();
                const qtd = data.stats.quantidade || 0;
                btnMovNovidades.style.display = 'block';
                if(qtd > 0) {
                    btnMovNovidades.innerHTML = `Entradas Recentes (${qtd})`;
                } else {
                    btnMovNovidades.innerHTML = `Entradas Recentes (0)`;
                }
            }
        } catch(err) {
            console.error('Erro ao buscar novidades:', err);
        }
    }

    // Carrega novidades após a importação e também ao inicializar
    checkNovidades();
    const originalLoadGrid = loadGrid;
    loadGrid = async function(page) {
        await originalLoadGrid(page);
        if(page === 1) checkNovidades(); // Recheck on tab open/filter
    };

    if(btnMovNovidades) {
        btnMovNovidades.addEventListener('click', async () => {
            if(novidadesModalOverlay) novidadesModalOverlay.classList.add('active');
            await renderNovidades();
        });
    }

    if(btnNovidadesClose) {
        btnNovidadesClose.addEventListener('click', () => {
            if(novidadesModalOverlay) novidadesModalOverlay.classList.remove('active');
        });
    }

    if(novidadesModalOverlay) {
        novidadesModalOverlay.addEventListener('click', (e) => {
            if(e.target === novidadesModalOverlay) novidadesModalOverlay.classList.remove('active');
        });
    }

    async function renderNovidades() {
        try {
            if(novTableBody) novTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">Carregando...</td></tr>`;
            
            const url = (window.__ENV && window.__ENV.SUPABASE_URL) ? `${window.__ENV.SUPABASE_URL}/api/movimentacoes/novidades` : 'http://localhost:8080/api/movimentacoes/novidades';
            const res = await fetch(url);
            if(!res.ok) throw new Error('Falha ao carregar novidades');
            
            const data = await res.json();
            currentNovidadesData = data.novidades || [];
            const stats = data.stats;
            
            // Atualiza Header
            const sub = document.getElementById('novidadesSubtitle');
            if(sub) {
                if(stats.ultima_importacao) {
                    const dt = new Date(stats.ultima_importacao);
                    sub.innerText = `Comparação baseada na última importação em ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR')}`;
                } else {
                    sub.innerText = `Comparação de importações mais recentes.`;
                }
            }
            
            // Atualiza KPIs
            const getEl = id => document.getElementById(id);
            if(getEl('novKpiTotal')) getEl('novKpiTotal').innerText = formatBRL(stats.total_valor || 0);
            if(getEl('novKpiQtd')) getEl('novKpiQtd').innerText = `${stats.quantidade || 0} registros`;
            
            if(getEl('novKpiArea')) getEl('novKpiArea').innerText = stats.top_area?.nome || '-';
            if(getEl('novKpiAreaVal')) getEl('novKpiAreaVal').innerText = formatBRL(stats.top_area?.valor || 0);
            
            if(getEl('novKpiSetor')) getEl('novKpiSetor').innerText = stats.top_setor?.nome || '-';
            if(getEl('novKpiSetorVal')) getEl('novKpiSetorVal').innerText = formatBRL(stats.top_setor?.valor || 0);
            
            if(getEl('novKpiMaior')) getEl('novKpiMaior').innerText = stats.maior_lancamento?.descricao?.substring(0,20) || '-';
            if(getEl('novKpiMaiorVal')) getEl('novKpiMaiorVal').innerText = formatBRL(stats.maior_lancamento?.valor_total || 0);
            
            renderNovidadesTable(currentNovidadesData);
            
        } catch(err) {
            console.error(err);
            if(novTableBody) novTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Erro ao carregar os dados.</td></tr>`;
        }
    }

    function renderNovidadesTable(lista) {
        if(!novTableBody) return;
        novTableBody.innerHTML = '';
        
        if(lista.length === 0) {
            novTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <div class="novidades-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    Nenhuma nova movimentação encontrada com base nestes filtros.
                </div>
            </td></tr>`;
            return;
        }
        
        lista.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: var(--muted);">${r.data_transacao || '-'}</td>
                <td style="font-family: monospace;">${r.codigo_item || '-'}</td>
                <td style="font-weight: 500;" title="${r.descricao || ''}">
                    <span class="novidades-badge" style="margin-right: 0.5rem;">NOVO</span>
                    ${(r.descricao || '').substring(0,40)}
                </td>
                <td style="color: var(--muted);">${r.area_id || '-'}</td>
                <td style="color: var(--muted);">${r.cost_center_id || '-'}</td>
                <td style="font-weight: 600; font-family: monospace; text-align: right; color: var(--text);">${formatBRL(r.valor_total || 0)}</td>
                <td style="color: var(--muted);">${r.documento || r.numero_ordem || '-'}</td>
                <td style="color: var(--muted);">${(r.collaborator_id || '-').substring(0,20)}</td>
            `;
            novTableBody.appendChild(tr);
        });
    }

    if(novFiltroBusca) {
        novFiltroBusca.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = currentNovidadesData.filter(r => {
                const searchStr = `${r.codigo_item} ${r.descricao} ${r.area_id} ${r.cost_center_id} ${r.documento} ${r.numero_ordem} ${r.collaborator_id}`.toLowerCase();
                return searchStr.includes(q);
            });
            renderNovidadesTable(filtered);
        });
    }

    if(btnNovExportarCsv) {
        btnNovExportarCsv.addEventListener('click', () => {
            const table = document.getElementById('novTable');
            if(!table) return;
            const rows = Array.from(table.querySelectorAll('tr'));
            const csv = rows.map(r => Array.from(r.querySelectorAll('th,td')).map(c => '"' + c.innerText.replace(/"/g, '""') + '"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "movimentacoes_recentes.csv";
            link.click();
        });
    }
});

