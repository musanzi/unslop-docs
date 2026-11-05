import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@web/domains/auth/shared/data-access';

export const unauthGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (authStore.isAdmin()) {
    return router.parseUrl('/admin');
  }

  if (authStore.isUser()) {
    return router.parseUrl('/user');
  }

  return true;
};
