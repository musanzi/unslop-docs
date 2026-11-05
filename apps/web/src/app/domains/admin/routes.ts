import { adminGuard } from '@web/core/guards';
import { Routes } from '@angular/router';

import { AdminLayout } from './layout/layout';

const routes: Routes = [
  {
    path: '',
    component: AdminLayout,
    canActivateChild: [adminGuard],
    children: [
      {
        path: '',
        title: 'Admin',
        loadComponent: () => import('./modules/stats/features/stats')
      },
      {
        path: 'users',
        title: 'Users',
        loadComponent: () => import('./modules/users/features/users-list/users-list')
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
