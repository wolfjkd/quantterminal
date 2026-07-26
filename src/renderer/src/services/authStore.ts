/** 认证状态管理（轻量版，无 zustand） */
import { useEffect, useState, useCallback } from 'react';
import { authApi, tokenStorage, userStorage, type UserInfo } from './api';

let _user: UserInfo | null = userStorage.get() as UserInfo | null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(_user);

  useEffect(() => {
    const fn = () => setUser(_user);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await authApi.login(username, password);
    tokenStorage.set(data.access_token);
    userStorage.set(data.user);
    _user = data.user;
    notify();
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    tokenStorage.clear();
    _user = null;
    notify();
  }, []);

  const isAuthenticated = useCallback(() => !!tokenStorage.get(), []);

  return { user, login, logout, isAuthenticated };
};

export const getCurrentUser = () => _user;
