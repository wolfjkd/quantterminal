/** tokenStorage / userStorage 工具函数测试 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStorage, userStorage } from '../services/api';

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('set/get token', () => {
    tokenStorage.set('abc123');
    expect(tokenStorage.get()).toBe('abc123');
  });

  it('clear removes token and user', () => {
    tokenStorage.set('abc123');
    userStorage.set({ id: 1, username: 'admin' });
    tokenStorage.clear();
    expect(tokenStorage.get()).toBeNull();
    expect(userStorage.get()).toBeNull();
  });

  it('get returns null when empty', () => {
    expect(tokenStorage.get()).toBeNull();
  });
});

describe('userStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('set/get user object', () => {
    const user = { id: 1, username: 'admin', role: 'admin' };
    userStorage.set(user);
    expect(userStorage.get()).toEqual(user);
  });

  it('get returns null when empty', () => {
    expect(userStorage.get()).toBeNull();
  });

  it('set overwrites previous', () => {
    userStorage.set({ id: 1, username: 'a' });
    userStorage.set({ id: 2, username: 'b' });
    expect(userStorage.get()).toEqual({ id: 2, username: 'b' });
  });
});
