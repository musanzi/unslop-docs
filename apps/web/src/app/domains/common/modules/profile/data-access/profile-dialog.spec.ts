import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { readFileSync } from 'node:fs';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { testUser } from '@web/shared/testing/user-fixture';
import Profile from '../features/profile/profile';
import { ProfileDialog } from './profile-dialog';

@Component({ selector: 'test-profile-opener', template: '<button (click)="profile.open()">Edit profile</button>' })
class Opener {
  readonly profile = inject(ProfileDialog);
}

afterEach(() => {
  TestBed.inject(MatDialog).closeAll();
  TestBed.resetTestingModule();
});

describe('Shared profile dialog', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideComponent(Profile, {
      set: {
        template: readFileSync(`${import.meta.dirname}/../features/profile/profile.html`, 'utf8'),
        templateUrl: undefined
      }
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockImplementation(() =>
      of(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    );
    const auth = TestBed.inject(AuthStore);
    auth.setUser(testUser);
    const fixture = TestBed.createComponent(Opener);
    await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    return { fixture, trigger, auth, http, dialog: TestBed.inject(MatDialog), opener: TestBed.inject(ProfileDialog) };
  }

  it('opens once, labels the modal, cancels without saving, and restores focus', async () => {
    const { fixture, trigger, auth, http, dialog, opener } = await setup();
    opener.open();
    expect(dialog.openDialogs).toHaveLength(1);
    const modal = document.querySelector('[role="dialog"]')!;
    expect(modal.getAttribute('aria-labelledby')).toBe('profile-dialog-heading');
    const input = modal.querySelector('input[autocomplete="name"]') as HTMLInputElement;
    input.value = 'Discarded';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const cancel = [...modal.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Cancel')!;
    cancel.click();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    expect(auth.user()?.name).toBe('Alice');
    expect(document.activeElement).toBe(trigger);
    http.expectNone('/auth/me/update');
    http.verify();
  });

  it('keeps the dialog open during save and updates the shared account after success', async () => {
    const { fixture, auth, http, dialog } = await setup();
    const input = document.querySelector('#profile-name') as HTMLInputElement;
    input.value = '  Updated name  ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    const request = http.expectOne('/auth/me/update');
    expect(request.request.body).toEqual({ name: 'Updated name' });
    dialog.openDialogs[0].close();
    expect(dialog.openDialogs).toHaveLength(1);
    request.flush({ ...testUser, name: 'Updated name' });
    await fixture.whenStable();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    expect(auth.user()?.name).toBe('Updated name');
    http.verify();
  });

  it('shows failed saves without closing and allows Escape after the request finishes', async () => {
    const { fixture, auth, http, dialog } = await setup();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    http.expectOne('/auth/me/update').flush({}, { status: 500, statusText: 'Server error' });
    await fixture.whenStable();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Unable to update your profile');
    expect(auth.user()?.name).toBe('Alice');
    document
      .querySelector('.cdk-overlay-pane')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    http.verify();
  });

  it('updates the visible avatar immediately after an upload', async () => {
    const { fixture, auth, http } = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['photo'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const request = http.expectOne('/users/profile/avatar');
    expect(request.request.body.get('avatar')).toBe(file);
    request.flush({ ...testUser, avatar: 'https://example.com/new.png' });
    await fixture.whenStable();
    expect(auth.user()?.avatar).toBe('https://example.com/new.png');
    expect(document.querySelector('img[alt="Profile photo"]')?.getAttribute('src')).toBe('https://example.com/new.png');
    http.verify();
  });
});
