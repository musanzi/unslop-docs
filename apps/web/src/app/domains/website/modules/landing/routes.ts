import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    title: 'Document editing for students',
    loadComponent: () => import('./features/landing').then((component) => component.Landing)
  }
];

export default routes;
