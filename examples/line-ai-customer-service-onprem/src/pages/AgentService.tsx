import { useEffect, useState } from 'react';
import { Bot, UserCheck, RefreshCcw } from 'lucide-react';

export default function AgentService() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHandoverUsers();
    const interval = setInterval(fetchHandoverUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchHandoverUsers = async () => {
    try {
      const res = await fetch('/api/user_states?is_human_mode=true');
      const data = await res.json();
      if (res.ok) setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch handover users:', err);
    }
    setLoading(false);
  };

  const switchToAI = async (userId: string) => {
    try {
      const res = await fetch('/api/user_states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_human_mode: false, line_user_id: userId })
      });
      if (!res.ok) throw new Error('Update failed');
      alert('已成功切換回 AI 客服。');
      fetchHandoverUsers();
    } catch (err: any) {
      alert(`操作失敗：${err.message}`);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">載入中...</div>;

  return (
    <div className="w-full flex-1 flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-red-600" />
            專人客服管理
          </h2>
          <p className="text-gray-500">處理目前正在進行中的真人對話請求</p>
        </div>
        <button onClick={fetchHandoverUsers} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCcw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr className="text-sm font-semibold text-gray-600">
                <th className="py-4 px-6">用戶暱稱</th>
                <th className="py-4 px-6">LINE User ID</th>
                <th className="py-4 px-6">呼叫時間</th>
                <th className="py-4 px-6">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Bot className="w-12 h-12 text-gray-200" />
                      <p>目前沒有待處理的真人請求</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.line_user_id} className="hover:bg-red-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-gray-800">{user.nickname || '未取得'}</td>
                    <td className="py-4 px-6 font-mono text-xs text-gray-500">{user.line_user_id}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {new Date(user.last_human_interaction).toLocaleString('zh-TW')}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => switchToAI(user.line_user_id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 shadow-sm"
                      >
                        轉回 AI 接手
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}