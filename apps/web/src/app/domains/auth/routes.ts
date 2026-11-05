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
            asideTitle: 'Return to your workspace',
            asideDescription: 'Sign in to a clear, modular application base that is ready to grow with your features.',
            asideFootnote: 'Keep a consistent authentication flow while you build the rest of your product.'
          }
        },
        loadComponent: () => import('./modules/sign-in/features/sign-in/sign-in').then((c) => c.AuthSignIn)
      }
    ]
  }
];

export default routes;
