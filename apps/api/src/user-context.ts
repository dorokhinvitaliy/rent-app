import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
export type User = { id: string; email: string; name: string; role: 'admin' | 'member' | 'guest' };
export const userContext = new AsyncLocalStorage<User>();
export const currentUser = () => userContext.getStore();
export function requireAdmin() {
  if (currentUser()?.role !== 'admin')
    throw new ForbiddenException('Изменять общую базу может только владелец');
}
