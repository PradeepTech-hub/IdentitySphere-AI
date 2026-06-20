import { createContext, useContext, useState } from 'react';
import { USERS } from '../data/mockData';
import { seedIfNeeded } from '../services/storageService';
import { buildUserFromAuth, persistAuthSession } from '../utils/authUtils';

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

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
