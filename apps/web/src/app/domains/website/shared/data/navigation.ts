import { INavigationLink } from '@web/domains/website/shared/interfaces';

export const NAVIGATION_LINKS: readonly INavigationLink[] = [
  { label: 'Home', path: '/', icon: 'house' },
  { label: 'Planned workflow', path: '/', fragment: 'features', icon: 'blocks' },
  { label: 'Your account', path: '/', fragment: 'get-started', icon: 'rocket' }
];
