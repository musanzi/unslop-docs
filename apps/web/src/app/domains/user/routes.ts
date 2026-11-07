import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'documents',
    children: [
      {
        // Keep the workspace alive while matching server rendering under documents/**.
        matcher: (segments) => {
          if (segments.length > 1) return null;
          return { consumed: segments, posParams: segments[0] ? { id: segments[0] } : undefined };
        },
        title: 'Documents',
        loadComponent: () =>
          import('./modules/documents/features/workspace/workspace').then((module) => module.Workspace)
      }
    ]
  },
  { path: 'profile', pathMatch: 'full', redirectTo: 'documents' },
  { path: '', pathMatch: 'full', redirectTo: 'documents' },
  { path: '**', redirectTo: 'documents' }
];

export default routes;
