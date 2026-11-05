import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { testUser } from '@web/shared/testing/user-fixture';
import { UserDetailStore } from './user-detail.store';

afterEach(() => TestBed.resetTestingModule());

function setup() {
  const params = new BehaviorSubject(convertToParamMap({ id: 'user-1' }));
  TestBed.configureTestingModule({
    providers: [
      UserDetailStore,
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } }
    ]
  });
  const store = TestBed.inject(UserDetailStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { store, http, params };
}

async function load() {
  const state = setup();
  state.http.expectOne('/users/by-id/user-1').flush(testUser);
  await Promise.resolve();
  TestBed.tick();
  state.http.expectOne('/users/user-1/status-changes').flush([]);
  await Promise.resolve();
  TestBed.tick();
  return state;
}

describe('Admin user details', () => {
  it('loads a direct ID independently of the list and saves status with refreshed audit history', async () => {
    const { store, http } = await load();
    expect(store.user.value()?.name).toBe('Alice');
    store.status.set('GOLD');
    const save = store.save();
    const request = http.expectOne('/users/user-1/status');
    expect(request.request.body).toEqual({ status: 'GOLD' });
    expect(store.saving()).toBe(true);
    await store.save();
    http.expectNone('/users/user-1/status');
    request.flush({ ...testUser, status: 'GOLD' });
    await save;
    TestBed.tick();
    http.expectOne('/users/user-1/status-changes').flush([]);
    expect(store.user.value()?.status).toBe('GOLD');
    expect(store.saved()).toContain('GOLD');
    http.verify();
  });

  it('preserves the account and shows an error if a status save fails', async () => {
    const { store, http } = await load();
    store.status.set('GOLD');
    const save = store.save();
    http.expectOne('/users/user-1/status').flush({}, { status: 403, statusText: 'Forbidden' });
    await save;
    expect(store.user.value()?.status).toBe('FREE');
    expect(store.saveError()).toContain('Unable to change status');
    expect(store.saving()).toBe(false);
    http.verify();
  });

  it('handles missing direct links and does not request their history', async () => {
    const { store, http } = setup();
    http.expectOne('/users/by-id/user-1').flush({}, { status: 404, statusText: 'Not found' });
    await Promise.resolve();
    TestBed.tick();
    expect(store.error()).toContain('Unable to load this user');
    http.expectNone('/users/user-1/status-changes');
    http.verify();
  });

  it('loads a new route ID without allowing an earlier save to overwrite it', async () => {
    const { store, http, params } = await load();
    store.status.set('GOLD');
    const save = store.save();
    const pending = http.expectOne('/users/user-1/status');
    params.next(convertToParamMap({ id: 'user-2' }));
    TestBed.tick();
    http.expectOne('/users/by-id/user-2').flush({ ...testUser, id: 'user-2', name: 'Bob' });
    await Promise.resolve();
    TestBed.tick();
    http.expectOne('/users/user-2/status-changes').flush([]);
    pending.flush({ ...testUser, status: 'GOLD' });
    await save;
    expect(store.user.value()?.id).toBe('user-2');
    expect(store.user.value()?.status).toBe('FREE');
    expect(store.saved()).toBe('');
    http.verify();
  });
});
