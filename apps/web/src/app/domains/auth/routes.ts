import { Routes } from '@angular/router';

import { AuthLayout } from './layout/layout';

const routes: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      {
        path: 'sign-in',
        title: 'Sign In',
        data: {
          authContent: {
            asideTitle: 'Welcome to unslop-docs',
            asideDescription: 'Document editing for students, with your meaning and language at the center.',
            asideFootnote: 'Google sign-in and profile management are available. Document processing is in development.'
          }
        },
        loadComponent: () => import('./modules/sign-in/features/sign-in/sign-in').then((c) => c.AuthSignIn)
      }
    ]
  }
];

export default routes;
