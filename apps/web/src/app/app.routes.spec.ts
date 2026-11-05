import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { routes } from './app.routes';
import authRoutes from './domains/auth/routes';

@Component({ selector: 'test-page', imports: [RouterOutlet], template: '<router-outlet />' })
class TestPage {}

const authPages: Routes = authRoutes.map((route) => ({
  ...route,
  component: TestPage,
  children: route.children?.map((child) => (child.loadComponent ? { ...child, loadComponent: () => TestPage } : child))
}));

const pages: Record<string, Routes> = {
  auth: authPages,
  user: [{ path: 'documents', component: TestPage }],
  admin: [{ path: '', component: TestPage }]
};

describe('Application navigation', () => {
  const auth = { isUser: vi.fn(), isAdmin: vi.fn() };

  beforeEach(() => {
    auth.isUser.mockReturnValue(false);
    auth.isAdmin.mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        provideRouter(
          routes.map((route) =>
            route.loadChildren ? { ...route, loadChildren: () => pages[route.path ?? ''] } : route
          )
        )
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it.each(['/', '/auth', '/auth/missing-page', '/missing-page', '/user/documents'])(
    'sends a signed-out visitor at %s to sign-in',
    async (url) => {
      await RouterTestingHarness.create(url);
      expect(TestBed.inject(Router).url).toBe('/auth/sign-in');
    }
  );

  it.each([false, true])('opens documents from the root for an authenticated account (admin: %s)', async (admin) => {
    auth.isUser.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(admin);
    await RouterTestingHarness.create('/');
    expect(TestBed.inject(Router).url).toBe('/user/documents');
  });

  it('keeps the signed-in redirect when visiting sign-in directly', async () => {
    auth.isUser.mockReturnValue(true);
    await RouterTestingHarness.create('/auth/sign-in');
    expect(TestBed.inject(Router).url).toBe('/user/documents');
  });

  it('preserves Google callback error details on the sign-in route', async () => {
    await RouterTestingHarness.create('/auth/sign-in?error=google-cancelled');
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/auth/sign-in?error=google-cancelled');
    expect(router.routerState.snapshot.root.firstChild?.queryParamMap.get('error')).toBe('google-cancelled');
  });
});
