import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { routes } from './app.routes';
import authRoutes from './domains/auth/routes';
import userRoutes from './domains/user/routes';
import adminRoutes from './domains/admin/routes';
import { of } from 'rxjs';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';

@Component({ selector: 'test-page', imports: [RouterOutlet], template: '<router-outlet />' })
class TestPage {}

function testPages(config: Routes): Routes {
  return config.map((route) => ({
    ...route,
    ...(route.component ? { component: TestPage } : {}),
    ...(route.loadComponent ? { loadComponent: () => TestPage } : {}),
    ...(route.children ? { children: testPages(route.children) } : {})
  }));
}

const pages: Record<string, Routes> = {
  auth: testPages(authRoutes),
  user: testPages(userRoutes),
  admin: testPages(adminRoutes)
};

describe('Application navigation', () => {
  const auth = { isUser: vi.fn(), isAdmin: vi.fn(), initialize: vi.fn() };

  beforeEach(() => {
    auth.isUser.mockReturnValue(false);
    auth.isAdmin.mockReturnValue(false);
    auth.initialize.mockImplementation(() => of({ isAdmin: auth.isAdmin() }));
    TestBed.configureTestingModule({
      providers: [
        provideLocationMocks(),
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
  it('opens direct admin details and supports browser back to the user list', async () => {
    auth.isUser.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(true);
    TestBed.inject(Router).setUpLocationChangeListener();
    const harness = await RouterTestingHarness.create('/admin/users/user-1');
    expect(TestBed.inject(Router).url).toBe('/admin/users/user-1');
    await harness.navigateByUrl('/admin/users');
    await harness.navigateByUrl('/admin/users/user-2');
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/admin/users'));
  });

  it('denies direct admin details to an ordinary account', async () => {
    auth.isUser.mockReturnValue(true);
    await RouterTestingHarness.create('/admin/users/user-1');
    expect(TestBed.inject(Router).url).toBe('/user/documents');
  });

  it.each([
    ['/user/profile', '/user/documents'],
    ['/admin/profile', '/admin']
  ])('redirects the obsolete profile page %s', async (url, destination) => {
    auth.isUser.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(true);
    await RouterTestingHarness.create(url);
    expect(TestBed.inject(Router).url).toBe(destination);
  });
});
