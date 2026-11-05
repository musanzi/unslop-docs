import { INavigationItem } from '@web/shared/interfaces';

export const NAVIGATION: INavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Track key metrics',
    children: [
      {
        id: 'stats',
        label: 'Statistics',
        icon: 'chart-no-axes-combined',
        route: '/admin',
        activeOptions: { exact: true }
      }
    ]
  },
  {
    id: 'users-and-access',
    label: 'Users and access',
    description: 'Manage accounts and permissions',
    children: [
      {
        id: 'users',
        label: 'Users',
        icon: 'users',
        route: 'users',
        activeOptions: { exact: false }
      }
    ]
  }
];
