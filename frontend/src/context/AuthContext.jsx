import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const loginLinkedIn = () => {
    const base = import.meta.env.VITE_API_URL || '';
    window.location.href = `${base}/auth/linkedin`;
  };

  const loginManual = async ({ name, headline, profileUrl }) => {
    const { data } = await api.post('/auth/manual-setup', { name, headline, profileUrl });
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const updateUser = (patch) => setUser(prev => ({ ...prev, ...patch }));

  return (
    <AuthContext.Provider value={{ user, loading, loginLinkedIn, loginManual, logout, updateUser, refreshUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
