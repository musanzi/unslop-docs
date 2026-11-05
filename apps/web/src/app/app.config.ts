import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, PLATFORM_ID, provideAppInitializer } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, TitleStrategy, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';
import { provideIcons } from '@/app/core/icons';
import { provideTheming } from '@/app/core/theming';
import { routes } from './app.routes';
import { httpInterceptor } from './core/interceptors';
import { PageTitleStrategy } from './core/strategies';
import { AuthStore } from '@web/domains/auth/shared/data-access';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        ...new MatDialogConfig(),
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)'
      }
    },
    provideHttpClient(withInterceptors([httpInterceptor])),
    provideClientHydration(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      })
    ),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideAppInitializer(() => {
      const platformId = inject(PLATFORM_ID);
      const authStore = inject(AuthStore);

      return isPlatformBrowser(platformId) ? authStore.initialize() : undefined;
    }),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        subscriptSizing: 'dynamic'
      }
    },
    provideNativeDateAdapter(),
    provideIcons(),
    provideTheming({
      primary: '#006da4',
      secondary: '#c2410c',
      error: '#dc2626'
    })
  ]
};
