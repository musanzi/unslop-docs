import { Routes } from '@angular/router';

import { UserLayout } from './layout/layout';

const routes: Routes = [
  {
    path: '',
    component: UserLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'profile'
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
