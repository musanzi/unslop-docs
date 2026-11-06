import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@web/domains/auth/shared/data-access';

export const unauthGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (authStore.isUser() || authStore.isAdmin()) {
    return router.parseUrl('/documents');
  }

  return true;
};
