import { Routes } from '@angular/router';

import { AuthLayout } from './layout/layout';

const routes: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
      {
        path: 'sign-in',
        title: 'Sign In',
        loadComponent: () => import('./modules/sign-in/features/sign-in/sign-in').then((c) => c.AuthSignIn)
      }
    ]
  }
];

export default routes;
