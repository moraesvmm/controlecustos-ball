-- Migration 006: Plano Mestre Tables

-- Tabela de Máquinas
CREATE TABLE public.plano_mestre_maquinas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag TEXT NOT NULL,
    nome_maquina TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    linha TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Atividades (Sistemas e Componentes)
CREATE TABLE public.plano_mestre_atividades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maquina_id UUID NOT NULL REFERENCES public.plano_mestre_maquinas(id) ON DELETE CASCADE,
    hierarquia_sistema TEXT NOT NULL, -- ex: "ABASTECIMENTO DE DISCO > MESA GIRATORIA > ELEVADOR DE DISCO"
    o_que_fazer TEXT NOT NULL,
    estrategia TEXT,
    material TEXT,
    hh NUMERIC,
    frequencia TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Histórico / Execução
CREATE TABLE public.plano_mestre_historico (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    atividade_id UUID NOT NULL REFERENCES public.plano_mestre_atividades(id) ON DELETE CASCADE,
    data_prevista DATE NOT NULL,
    data_execucao DATE,
    responsavel TEXT,
    status TEXT DEFAULT 'PENDENTE', -- PENDENTE, CONCLUIDO, ATRASADO
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security) se necessário
ALTER TABLE public.plano_mestre_maquinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_mestre_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_mestre_historico ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso anônimo/público (Ajuste conforme as regras do projeto)
CREATE POLICY "Permitir leitura pública nas maquinas" ON public.plano_mestre_maquinas FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública nas maquinas" ON public.plano_mestre_maquinas FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública nas maquinas" ON public.plano_mestre_maquinas FOR UPDATE USING (true);
CREATE POLICY "Permitir deleção pública nas maquinas" ON public.plano_mestre_maquinas FOR DELETE USING (true);

CREATE POLICY "Permitir leitura pública nas atividades" ON public.plano_mestre_atividades FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública nas atividades" ON public.plano_mestre_atividades FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública nas atividades" ON public.plano_mestre_atividades FOR UPDATE USING (true);
CREATE POLICY "Permitir deleção pública nas atividades" ON public.plano_mestre_atividades FOR DELETE USING (true);

CREATE POLICY "Permitir leitura pública no historico" ON public.plano_mestre_historico FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública no historico" ON public.plano_mestre_historico FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública no historico" ON public.plano_mestre_historico FOR UPDATE USING (true);
CREATE POLICY "Permitir deleção pública no historico" ON public.plano_mestre_historico FOR DELETE USING (true);
