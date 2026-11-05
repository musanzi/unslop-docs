import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testUser } from '@web/shared/testing/user-fixture';
import { AuthStore } from './auth.store';

@Component({ selector: 'test-sign-in', template: 'Sign in' })
class SignIn {}

afterEach(() => TestBed.resetTestingModule());

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'auth/sign-in', component: SignIn }]),
      provideHttpClient(),
      provideHttpClientTesting()
    ]
  });
  const auth = TestBed.inject(AuthStore);
  auth.setUser(testUser);
  return { auth, http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

describe('Account sign-out', () => {
  it('prevents duplicate requests and navigates only after success', async () => {
    const { auth, http, router } = setup();
    auth.signOut();
    auth.signOut();
    expect(auth.isSigningOut()).toBe(true);
    const requests = http.match('/auth/signout');
    expect(requests).toHaveLength(1);
    expect(auth.user()).toEqual(testUser);
    requests[0].flush(null);
    await vi.waitFor(() => expect(router.url).toBe('/auth/sign-in'));
    expect(auth.user()).toBeNull();
    expect(auth.isSigningOut()).toBe(false);
    http.verify();
  });

  it('keeps the account available and exposes a retryable error on failure', () => {
    const { auth, http } = setup();
    auth.signOut();
    http.expectOne('/auth/signout').flush({}, { status: 500, statusText: 'Server error' });
    expect(auth.user()).toEqual(testUser);
    expect(auth.signOutError()).toContain('Unable to sign out');
    expect(auth.isSigningOut()).toBe(false);
    auth.signOut();
    expect(auth.signOutError()).toBe('');
    http.expectOne('/auth/signout').flush({}, { status: 500, statusText: 'Server error' });
    http.verify();
  });
});
