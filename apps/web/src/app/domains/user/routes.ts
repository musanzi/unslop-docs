import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'documents',
    title: 'Documents',
    loadComponent: () => import('./modules/documents/features/workspace/workspace').then((module) => module.Workspace)
  },
  { path: 'profile', pathMatch: 'full', redirectTo: 'documents' },
  { path: '', pathMatch: 'full', redirectTo: 'documents' },
  { path: '**', redirectTo: 'documents' }
];

export default routes;
