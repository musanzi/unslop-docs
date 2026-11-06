import { Route } from '@angular/router';
import { adminGuard, authGuard, unauthGuard } from './core/guards';

export const routes: Route[] = [
  {
    path: 'auth',
    canActivate: [unauthGuard],
    loadChildren: () => import('./domains/auth/routes')
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./domains/admin/routes')
  },
  {
    path: 'user/documents/:id',
    redirectTo: '/documents/:id'
  },
  {
    path: 'user',
    children: [{ path: '**', redirectTo: '/documents' }]
  },
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () => import('./domains/user/routes')
  },
  { path: '**', redirectTo: '/auth/sign-in' }
];
