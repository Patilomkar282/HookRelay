import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginApi, registerApi, getMeApi } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('hookrelay_token'));
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Fetch /auth/me if token exists
  const loadUser = useCallback(async (jwtToken) => {
    if (!jwtToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const userData = await getMeApi();
      setUser(userData);
      setAuthError(null);
    } catch (err) {
      console.warn('Failed to fetch user with token:', err.message);
      // If token is invalid or expired (401), clear it
      logout();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadUser(token);
    } else {
      setIsLoading(false);
    }
  }, [token, loadUser]);

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const data = await loginApi(email, password);
      localStorage.setItem('hookrelay_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return data;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const register = async (email, password) => {
    setAuthError(null);
    try {
      const data = await registerApi(email, password);
      localStorage.setItem('hookrelay_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return data;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('hookrelay_token');
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await getMeApi();
      setUser(userData);
      return userData;
    } catch (err) {
      console.warn('Failed to refresh user:', err.message);
    }
  };

  const testMe = async () => {
    return await getMeApi();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token,
        isAuthenticated: !!user,
        isLoading,
        authError,
        setAuthError,
        login,
        register,
        logout,
        refreshUser,
        testMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
