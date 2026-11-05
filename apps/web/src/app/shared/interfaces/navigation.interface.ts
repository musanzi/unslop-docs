import { IsActiveMatchOptions } from '@angular/router';

export type INavigationActiveOptions = { exact: boolean } | IsActiveMatchOptions;

export interface INavigationItem {
  id: string;
  label: string;
  description?: string;
  route?: string;
  icon?: string;
  badge?: string;
  children?: INavigationItem[];
  disabled?: boolean;
  expanded?: boolean;
  activeOptions?: INavigationActiveOptions;
}
