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
      },
      {
        path: 'sign-up',
        title: 'Sign Up',
        data: {
          authContent: {
            asideTitle: 'Create your workspace',
            asideDescription:
              'Start from a clean, modular base that is ready for your features without starting from scratch.',
            asideFootnote: 'Structure your application with authentication flows already aligned to your interface.'
          }
        },
        loadComponent: () => import('./modules/sign-up/features/sign-up/sign-up').then((c) => c.AuthSignUp)
      },
      {
        path: 'forgot-password',
        title: 'Forgot Password',
        data: {
          authContent: {
            asideTitle: 'Recover your access',
            asideDescription: 'Receive a secure link to regain access to your account and continue your work.',
            asideFootnote:
              'The flow stays clear, direct, and consistent with the rest of the authentication experience.'
          }
        },
        loadComponent: () =>
          import('./modules/forgot-password/features/forgot-password/forgot-password').then((c) => c.AuthForgotPassword)
      },
      {
        path: 'forgot-password-sent',
        title: 'Forgot Password Link Sent',
        data: {
          authContent: {
            asideTitle: 'Check your inbox',
            asideDescription: 'Open the link sent to your email address before it expires to set a new password.',
            asideFootnote: 'This step confirms delivery without exposing whether an account exists for the address.'
          }
        },
        loadComponent: () =>
          import('./modules/forgot-password-sent/features/forgot-password-sent/forgot-password-sent').then(
            (c) => c.AuthForgotPasswordSent
          )
      },
      {
        path: 'reset-password',
        title: 'Reset Password',
        data: {
          authContent: {
            asideTitle: 'Secure your account',
            asideDescription: 'Choose a new password and finish recovery in a familiar interface.',
            asideFootnote: 'Error states and primary actions stay visible without changing business logic.'
          }
        },
        loadComponent: () =>
          import('./modules/reset-password/features/reset-password/reset-password').then((c) => c.AuthResetPassword)
      }
    ]
  }
];

export default routes;
