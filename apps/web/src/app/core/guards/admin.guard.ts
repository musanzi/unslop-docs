import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@web/domains/auth/shared/data-access';

export const adminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return authStore.isAdmin() ? true : router.parseUrl('/auth/sign-in');
};
