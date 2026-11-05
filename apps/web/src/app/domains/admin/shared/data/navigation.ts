import { INavigationItem } from '@web/shared/interfaces';

export const NAVIGATION: INavigationItem[] = [
  {
    id: 'overview',
    label: "Vue d'ensemble",
    description: 'Track key metrics',
    children: [
      {
        id: 'stats',
        label: 'Statistiques',
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
      },
      {
        id: 'roles',
        label: 'Roles',
        icon: 'shield-check',
        route: 'roles',
        activeOptions: { exact: false }
      }
    ]
  }
];
