import { map } from 'rxjs';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@web/domains/auth/shared/data-access';

export const adminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return authStore.initialize().pipe(map((user) => (user?.isAdmin === true ? true : router.parseUrl('/auth/sign-in'))));
};
