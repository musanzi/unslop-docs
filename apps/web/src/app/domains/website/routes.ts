import { Routes } from '@angular/router';
import { WebLayout } from '@/app/domains/website/layout/layout';

const routes: Routes = [
  {
    path: '',
    component: WebLayout,
    children: [
      {
        path: '',
        title: 'Document editing for students',
        loadChildren: () => import('./modules/landing/routes')
      },
      { path: '**', redirectTo: '' }
    ]
  }
];

export default routes;
