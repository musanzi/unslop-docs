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
        title: 'Overview',
        pathMatch: 'full',
        loadComponent: () => import('./modules/stats/features/stats')
      },
      {
        path: 'users',
        title: 'Users',
        loadComponent: () => import('./modules/users/features/users-list/users-list')
      },
      {
        path: 'users/:id',
        title: 'User details',
        loadComponent: () => import('./modules/users/features/user-detail/user-detail')
      },
      { path: 'profile', pathMatch: 'full', redirectTo: '' },
      { path: '**', redirectTo: '' }
    ]
  }
];

export default routes;
