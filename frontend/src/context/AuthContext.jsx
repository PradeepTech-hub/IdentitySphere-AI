import { createContext, useContext, useEffect, useState } from 'react';
import { USERS } from '../data/mockData';
import { seedIfNeeded } from '../services/storageService';
import { buildUserFromAuth, persistAuthSession } from '../utils/authUtils';
import { fetchAuthMe, getAuthToken } from '../services/governanceService';

seedIfNeeded();

const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const saved = sessionStorage.getItem('is_auth');
    if (!saved) return null;
    return buildUserFromAuth(JSON.parse(saved));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredAuth);
  const [authReady, setAuthReady] = useState(!getAuthToken());

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    fetchAuthMe()
      .then((me) => {
        const stored = readStoredAuth();
        const userData = buildUserFromAuth({
          email: me.email,
          role: me.role,
          name: stored?.name,
          auth_token: token,
        });
        setUser(userData);
        persistAuthSession(userData);
      })
      .catch(() => {
        sessionStorage.removeItem('is_auth');
        setUser(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const login = (email) => {
    const trimmed = (email || '').trim();
    if (!trimmed) return false;

    const demo = USERS[trimmed.toLowerCase()] || USERS[trimmed];
    const userData = buildUserFromAuth({
      email: trimmed,
      role: demo?.role,
    });
    if (!userData) return false;

    setUser(userData);
    persistAuthSession(userData);
    return true;
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('is_auth');
    window.location.href = '/login.html';
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
