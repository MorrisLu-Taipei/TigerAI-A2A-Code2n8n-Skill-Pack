import { useEffect, useState } from 'react';
import { Save, RefreshCcw, Copy, Bot, MessageCircle, Search, Settings } from 'lucide-react';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [collections, setCollections] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [credentials, setCredentials] = useState<any[]>([]);
  
  // Logs Search States
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');

  useEffect(() => {
    fetchSettings();
    fetchCredentials();
    fetchCollections();
    // dev 模式 (5173) 時指向實際後端 port 3010，production 則用當前 origin
    const origin = window.location.port === '5173'
      ? window.location.protocol + '//' + window.location.hostname + ':3010'
      : window.location.origin;
    setWebhookUrl(origin + '/api/line/webhook');
  }, []);

  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/qdrant/collections');
      const data = await response.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Failed to fetch Qdrant collections', error);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data || {});
    } catch (error) {
      console.error('Error fetching settings:', error);
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async () => {
    try {
      const response = await fetch('/api/n8n/credentials');
      const data = await response.json();
      setCredentials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Failed to fetch n8n credentials', error);
      setCredentials([]);
    }
  };

  const fetchLogs = async () => {
    try {
      const url = new URL('/api/logs/search', window.location.origin);
      if (searchQuery) url.searchParams.append('query', searchQuery);
      if (userIdFilter) url.searchParams.append('userId', userIdFilter);
      const res = await fetch(url.toString());
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error('Failed to fetch logs');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to save settings');
      alert('所有核心設定已儲存成功！');
      fetchSettings();
    } catch (error: any) {
      alert(`儲存失敗：${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleResetHandover = async () => {
    if (!confirm('確定要結束所有人的「真人轉接模式」，讓 AI 全面接管嗎？')) return;
    try {
      const response = await fetch('/api/reset-handover', { method: 'POST' });
      if (response.ok) {
        alert('轉接狀態已重置！');
        fetchSettings();
      }
    } catch (error) {
      alert('重置失敗');
    }
  };

  const renderAIField = (label: string, name: string, type: string = "text", placeholder: string = "") => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input 
        type={type} 
        name={name} 
        value={settings?.[name] || ''} 
        onChange={handleChange} 
        className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all focus:bg-white bg-gray-50/50" 
        placeholder={placeholder}
      />
    </div>
  );

  const renderCredentialDropdown = (label: string, name: string, n8nType: string) => {
    const list = Array.isArray(credentials) ? credentials : [];
    const filtered = list.filter(c => c.type === n8nType);
    return (
      <div className="col-span-1">
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select
          name={name}
          value={settings?.[name] || ''}
          onChange={handleChange}
          className="w-full px-4 py-2 border rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
        >
          <option value="">-- 請選擇 n8n 憑證 --</option>
          {filtered.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.id.substring(0,4)}...)</option>
          ))}
        </select>
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium animate-pulse">✨ 正在喚醒大腦配置與日誌紀錄...</p>
      </div>
    </div>
  );

  const activeAiId = settings?.active_ai || 'gpt';
  const providers = [
    { id: 'gpt', name: 'OpenAI', icon: Bot, color: 'blue', desc: 'GPT-4o 系列' },
    { id: 'gemini', name: 'Gemini', icon: Bot, color: 'purple', desc: '1.5 Flash/Pro' },
    { id: 'ollama', name: 'Ollama', icon: Bot, color: 'orange', desc: 'Llama3 地端' }
  ];

  return (
    <div className="w-full flex-1 flex flex-col gap-8 pb-20 pt-10 animate-in fade-in duration-500">
      {/* Header Overlay */}
      <div className="w-full flex justify-between items-center bg-white p-7 rounded-2xl shadow-sm border border-gray-100 ring-1 ring-gray-200">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-blue-600 rounded-2xl text-white shadow-blue-200 shadow-lg"><Bot className="w-6 h-6" /></div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">AI 客服大腦主控台</h2>
            <p className="text-gray-400 text-sm font-medium">Visual Brain Architecture v2.0</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {settings?.updated_at && (
            <span className="text-xs text-gray-400 font-medium">
              最後更新：{new Date(settings.updated_at).toLocaleString('zh-TW')}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 shadow-xl transition-all active:scale-95">
            {saving ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            永久保存
          </button>
        </div>
      </div>

      {/* AI Strategy Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
        {providers.map(p => (
          <button 
            key={p.id}
            onClick={() => setSettings({ ...settings, active_ai: p.id })} 
            className={`w-full p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${activeAiId === p.id ? `border-blue-500 bg-blue-50/50 shadow-inner` : 'border-white bg-white shadow-sm hover:border-gray-200'}`}
          >
            <div className={`p-4 rounded-xl ${activeAiId === p.id ? `bg-blue-600 text-white shadow-blue-100 shadow-md` : 'bg-gray-50 text-gray-400'}`}><p.icon className="w-7 h-7" /></div>
            <h3 className="font-black text-gray-800">{p.name}</h3>
          </button>
        ))}
      </div>

      {/* 1. Core Brain AI Configuration */}
      <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-7">
        <h3 className="text-lg font-black border-b border-gray-50 pb-5 flex items-center gap-3 text-gray-900 uppercase">
          <Settings className="w-5 h-5 text-blue-600" /> 第一層：腦部決策核心
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {activeAiId === 'gpt' && renderCredentialDropdown('OpenAI n8n 憑證 ID', 'openai_credential_id', 'openAiApi')}
          {activeAiId === 'gemini' && renderCredentialDropdown('Gemini n8n 憑證 ID', 'gemini_credential_id', 'googleGenerativeAiApi')}
          {activeAiId === 'ollama' && renderCredentialDropdown('Ollama n8n 憑證 ID', 'ollama_credential_id', 'ollamaApi')}
          
          <div className="col-span-1">
            <label className="block text-sm font-bold text-gray-700 mb-1">Qdrant 大腦知識庫</label>
            <select name="qdrant_collection" value={settings?.qdrant_collection || ''} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg bg-gray-50 font-medium">
              <option value="">-- 請選擇 Collection --</option>
              {collections.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="col-span-2 space-y-5 pt-2">
            <div>
              <label className="block text-sm font-black text-gray-800 mb-2">🧠 系統提示詞 (System Prompt)</label>
              <textarea name="system_prompt" value={settings?.system_prompt || ''} onChange={handleChange} rows={4} className="w-full px-4 py-3 border rounded-xl font-mono text-sm bg-gray-50/50 shadow-inner outline-indigo-500" placeholder="設定 AI 的說話口氣與專業領域..." />
            </div>
            <div>
              <label className="block text-sm font-black text-gray-800 mb-2">📄 靜態對話知識板塊 (Reference)</label>
              <textarea name="reference_text" value={settings?.reference_text || ''} onChange={handleChange} rows={4} className="w-full px-4 py-3 border rounded-xl font-mono text-sm bg-gray-50/50 shadow-inner outline-indigo-500" placeholder="例如：產品價目表、公司官網、聯絡方式..." />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Visual Brain - n8n Webhook Tunnel */}
      <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-7 ring-1 ring-indigo-50">
        <h3 className="text-lg font-black border-b border-gray-50 pb-5 flex items-center gap-3 text-gray-900 uppercase">
          <RefreshCcw className="w-5 h-5 text-indigo-600" /> 第二層：n8n 可視化通路
        </h3>
        <div className="space-y-5">
          <div className="flex items-center gap-4 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50">
            <span className="text-sm font-black text-indigo-900">同步啟動 n8n 工作流 (專人客服腦)</span>
            <button onClick={() => setSettings({ ...settings, use_n8n: !settings?.use_n8n })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings?.use_n8n ? 'bg-indigo-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings?.use_n8n ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
            <label className="block text-sm font-black text-gray-800 mb-2">n8n Webhook 通訊 URL (必填)</label>
            <input type="text" name="n8n_webhook_url" value={settings?.n8n_webhook_url || ''} onChange={handleChange} className="w-full px-5 py-3 border-2 rounded-xl font-mono text-sm bg-white shadow-indigo-50 shadow-md outline-none focus:border-indigo-500" placeholder="https://n8n.your-app.com/webhook/..." />
          </div>
        </div>
      </div>

      {/* 3. LINE Credentials & Human Handover (Unified) */}
      <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-7">
        <div className="flex justify-between items-center border-b border-gray-50 pb-5">
          <h3 className="text-lg font-black flex items-center gap-3 text-gray-900 uppercase">
            <MessageCircle className="w-5 h-5 text-green-500" /> 第三層：LINE 憑證與轉接中心
          </h3>
          <button onClick={handleResetHandover} className="text-xs font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 hover:bg-red-100 transition-all active:scale-95 shadow-sm">🛑 一鍵歸還給 AI</button>
        </div>
        
        <div className="space-y-8">
          {/* LINE Webhook URL Display */}
          <div className="flex items-center gap-3 p-4 bg-green-50/40 rounded-xl border border-green-100/50">
            <span className="text-sm font-black text-gray-700 whitespace-nowrap">LINE Webhook URL</span>
            <code className="flex-1 px-4 py-2 bg-white rounded-lg border text-sm font-mono text-gray-600 truncate">{webhookUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert('已複製！'); }} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-xs rounded-lg font-bold hover:bg-green-700 transition-all active:scale-95 shadow-sm">
              <Copy className="w-3.5 h-3.5" /> 複製
            </button>
          </div>

          {/* LINE Credentials */}
          <div className="grid grid-cols-2 gap-5 p-6 bg-green-50/20 rounded-2xl border border-green-100/40">
            {renderAIField('LINE Channel Access Token', 'line_channel_access_token', 'password', '貼上您的 LINE Token')}
            {renderAIField('LINE Channel Secret', 'line_channel_secret', 'password', '貼上您的 LINE Secret')}
          </div>

          <div className="flex items-center gap-4 px-2">
            <span className="text-sm font-black text-gray-800">強制切換為 [專人客服模式]</span>
            <button onClick={() => setSettings({ ...settings, handover_enabled: !settings?.handover_enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings?.handover_enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings?.handover_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-5 bg-gray-50/50 p-7 rounded-2xl border border-dashed border-gray-200">
            {renderAIField('觸發轉接關鍵字', 'handover_keywords', 'text', '真人,客服,專員 (逗號隔開)')}
            {renderAIField('自動重置時間 (分鐘)', 'handover_timeout_minutes', 'number', '30')}
            <div className="col-span-2">
              {renderAIField('專員 LINE User IDs (重要！推播警告用)', 'admin_line_ids', 'text', 'U12345..., U67890...')}
            </div>
          </div>

          {/* Integrated Logs for Monitoring */}
          <div className="pt-10 mt-8 border-t border-gray-50">
            <div className="flex items-center justify-between mb-8">
              <h4 className="font-black text-gray-800 flex items-center gap-3">
                <Search className="w-5 h-5 text-indigo-600" /> 真人工作流對話監控站
              </h4>
              <div className="flex gap-2">
                <input type="text" placeholder="全局搜索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="px-4 py-2 text-xs border rounded-xl w-48 shadow-sm focus:bg-white" />
                <button onClick={fetchLogs} className="px-6 py-2 bg-indigo-600 text-white text-xs rounded-xl font-black shadow-lg hover:shadow-indigo-200 transition-all">全量追蹤</button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden shadow-inner">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-xs bg-transparent">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="px-5 py-4 font-black uppercase text-gray-500">時間點</th>
                      <th className="px-5 py-4 font-black uppercase text-gray-500">身分</th>
                      <th className="px-5 py-4 font-black uppercase text-gray-500">對話內容</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-white transition-colors">
                        <td className="px-5 py-4 text-gray-400 font-medium whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString('zh-TW')}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-lg font-black text-[9px] ${log.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                            {log.role === 'user' ? '👤 用戶' : '🦾 自動應答'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-800 font-medium leading-relaxed">{log.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}