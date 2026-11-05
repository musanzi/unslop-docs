import { Routes } from '@angular/router';

import { UserLayout } from './layout/layout';

const routes: Routes = [
  {
    path: 'documents',
    title: 'Documents',
    loadComponent: () => import('./modules/documents/features/workspace/workspace').then((module) => module.Workspace)
  },
  {
    path: '',
    component: UserLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'documents'
      },
      {
        path: 'profile',
        title: 'My profile',
        loadComponent: () => import('../common/modules/profile/features/profile/profile')
      }
    ]
  }
];

export default routes;
