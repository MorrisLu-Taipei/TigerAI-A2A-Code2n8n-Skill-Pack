-- ============================================
-- AI 客服系統 - PostgreSQL Schema (Local Edge)
-- ============================================

-- 1. 系統設定表 (Singleton: 只有一筆)
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- AI 模型設定
    active_ai TEXT DEFAULT 'gpt',
    is_ai_enabled BOOLEAN DEFAULT true,
    system_prompt TEXT,
    reference_text TEXT,
    -- OpenAI
    gpt_model TEXT DEFAULT 'gpt-4o',
    gpt_credential_id TEXT,
    openai_credential_id TEXT,
    -- Gemini
    gemini_model TEXT DEFAULT 'gemini-1.5-pro',
    gemini_credential_id TEXT,
    -- Ollama
    ollama_url TEXT,
    ollama_model TEXT,
    ollama_credential_id TEXT,
    -- Qdrant
    qdrant_url TEXT,
    qdrant_api_key TEXT,
    qdrant_collection TEXT,
    qdrant_credential_id TEXT,
    -- LINE
    line_channel_access_token TEXT,
    line_channel_secret TEXT,
    -- 專人客服轉接
    handover_enabled BOOLEAN DEFAULT false,
    handover_keywords TEXT DEFAULT '真人,客服,人工',
    handover_timeout INTEGER DEFAULT 30,
    handover_timeout_minutes INTEGER,
    admin_line_ids TEXT,
    -- n8n
    use_n8n BOOLEAN DEFAULT false,
    n8n_webhook_url TEXT,
    -- 時間戳
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. 用戶狀態表
CREATE TABLE IF NOT EXISTS public.user_states (
    line_user_id TEXT PRIMARY KEY,
    nickname TEXT,
    is_human_mode BOOLEAN DEFAULT false,
    last_human_interaction TIMESTAMP WITH TIME ZONE,
    last_ai_reset_at TIMESTAMP WITH TIME ZONE
);

-- 3. 對話記錄表
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON public.chat_logs (line_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_content ON public.chat_logs USING gin(to_tsvector('simple', content));

-- 4. 初始資料 (Singleton row)
INSERT INTO public.app_settings (id)
SELECT '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);