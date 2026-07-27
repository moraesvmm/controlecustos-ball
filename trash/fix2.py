
import sys

with open('//britufps01/group/Manutenção/25 - SISTEMA CONTROLE DE CUSTOS/controle-rc-system/js/indicadores.js', 'r', encoding='latin-1') as f:
    text = f.read()

idx = text.rfind('window.abrirDrilldownMaquinas = async function(periodo) {')
if idx != -1:
    text = text[:idx]

func = '''window.abrirDrilldownMaquinas = async function(periodo) {
  document.getElementById('modalDrilldownSub').textContent = Período: ;
  document.getElementById('modal-drilldown-maquinas').style.display = 'flex';
  
  const chartEl = document.getElementById('chartDrilldownMaquinas');
  let inst = echarts.getInstanceByDom(chartEl);
  if(!inst) inst = echarts.init(chartEl);
  
  inst.showLoading({ text: 'Carregando...', color: '#10b981', textColor: '#f1f5f9', maskColor: 'rgba(15, 23, 42, 0.8)' });
  
  try {
    const resp = await fetch(/api/kpi/drilldown_maquinas?semana=);
    const data = await resp.json();
    inst.hideLoading();
    
    // Sort descending by time
    data.sort((a,b) => a.tempo_total_min - b.tempo_total_min);
    
    inst.setOption({
      backgroundColor: 'transparent',
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)', 
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#f1f5f9' },
        formatter: (params) => {
          let s = <strong></strong><br/>;
          params.forEach(p => {
            s += ${p.marker} :  <br/>;
          });
          return s;
        }
      },
      legend: { textStyle: { color: '#94a3b8' } },
      grid: { left: '3%', right: '10%', bottom: '3%', containLabel: true },
      xAxis: [
        { type: 'value', name: 'Tempo (min)', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } } },
        { type: 'value', name: 'Nº Falhas', position: 'top', axisLabel: { color: '#94a3b8' }, splitLine: { show: false } }
      ],
      yAxis: { type: 'category', data: data.map(d => d.maquina), axisLabel: { color: '#e2e8f0', fontWeight: '500' } },
      series: [
        {
          name: 'Tempo Parado',
          type: 'bar',
          xAxisIndex: 0,
          data: data.map(d => d.tempo_total_min),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{offset:0, color: '#f43f5e'}, {offset:1, color: 'rgba(244, 63, 94, 0.2)'}]),
            borderRadius: [0, 6, 6, 0]
          },
          label: { show: true, position: 'right', color: '#f1f5f9', formatter: '{c}m' }
        },
        {
          name: 'Qtd Falhas',
          type: 'line',
          xAxisIndex: 1,
          data: data.map(d => d.n_falhas),
          itemStyle: { color: '#38bdf8' },
          symbolSize: 10,
          lineStyle: { width: 3, type: 'dashed' },
          label: { show: true, position: 'top', color: '#38bdf8', formatter: '{c}' }
        }
      ]
    });
  } catch(e) {
    inst.hideLoading();
    console.error(e);
  }
};
'''
text += func

with open('//britufps01/group/Manutenção/25 - SISTEMA CONTROLE DE CUSTOS/controle-rc-system/js/indicadores.js', 'w', encoding='latin-1', newline='') as f:
    f.write(text)
print('OK')

