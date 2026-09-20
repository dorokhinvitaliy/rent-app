import { request } from '@playwright/test';
export default async function setup() {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const credentials = {
    email: 'e2e@example.test',
    password: 'e2e-password-long',
    invite: 'e2e-invitation-secret-at-least-24',
  };
  const login = await api.post('/api/auth/login', { data: credentials });
  if (!login.ok()) {
    const registered = await api.post('/api/auth/register', { data: credentials });
    if (!registered.ok()) throw new Error(await registered.text());
  }
  await api.storageState({ path: 'test-results/auth.json' });
  await api.dispose();
}
