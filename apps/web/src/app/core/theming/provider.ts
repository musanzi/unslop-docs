import {
  EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  provideAppInitializer
} from '@angular/core';
import type { IThemeConfig } from './interfaces';
import { Theming } from './theming';

export const THEME_CONFIG = new InjectionToken<IThemeConfig>('THEME_CONFIG');

export const provideTheming = (config: IThemeConfig): EnvironmentProviders =>
  makeEnvironmentProviders([
    {
      provide: THEME_CONFIG,
      useValue: config
    },

    // Initialize the Theming
    provideAppInitializer(() => {
      inject(Theming);
    })
  ]);
