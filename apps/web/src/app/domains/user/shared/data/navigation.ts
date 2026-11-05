import { INavigationItem } from '@web/shared/interfaces';

export const NAVIGATION: INavigationItem[] = [
  {
    id: 'account',
    label: 'My account',
    description: 'Manage your personal information',
    children: [
      {
        id: 'documents',
        label: 'Documents',
        icon: 'files',
        route: '/user/documents',
        activeOptions: { exact: true }
      },
      {
        id: 'profile',
        label: 'My profile',
        icon: 'user-round',
        route: '/user/profile',
        activeOptions: { exact: true }
      }
    ]
  }
];
