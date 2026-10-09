import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT, ApiError, api } from './api';

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('api error handling', () => {
  it('signals an expired session on a 401 from a normal endpoint', async () => {
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    stubFetch(401, { error: 'Not authenticated' });
    await expect(api.listLoans()).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  it('does not log the user out when change-password rejects the current password (#4)', async () => {
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    for (const status of [400, 401]) {
      stubFetch(status, { error: 'Current password is incorrect' });
      await expect(api.changePassword('wrong', 'newpass123')).rejects.toThrow('Current password is incorrect');
    }
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });
});
