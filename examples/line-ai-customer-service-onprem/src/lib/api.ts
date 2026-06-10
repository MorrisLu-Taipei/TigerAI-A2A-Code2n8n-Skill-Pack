const BASE_URL = '/api';

export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('auth', 'true');
        return { user: data.user, error: null };
      }
      return { user: null, error: data.message || '帳號或密碼錯誤' };
    },
    logout: () => {
      localStorage.removeItem('auth');
      window.location.reload();
    },
    isLoggedIn: () => !!localStorage.getItem('auth'),
  },
};