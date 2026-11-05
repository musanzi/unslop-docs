import type { IUpdateStatusDto, IUserResponse } from '@unslop-docs/api-contracts';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, exhaustMap, finalize, pipe, switchMap, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

import { IUsersState } from '@web/domains/admin/modules/users/interfaces';

import { UsersService } from './users.service';

const initialState: IUsersState = {
  isExporting: false,
  isUpdating: false,
  statusMessage: '',
  error: ''
};

export const UsersStore = signalStore(
  withState(initialState),
  withProps(() => ({
    _data: inject(UsersService),
    _document: inject(DOCUMENT),
    _http: inject(HttpClient)
  })),
  withMethods(({ _data, _document, _http, ...store }) => ({
    updateStatus: rxMethod<{ userId: string; status: IUpdateStatusDto['status'] }>(
      pipe(
        exhaustMap(({ userId, status }) => {
          patchState(store, { isUpdating: true, error: '', statusMessage: '' });
          return _http.patch<IUserResponse>(`/users/${userId}/status`, { status }).pipe(
            tap((user) => {
              _data.applyUser(user);
              patchState(store, { statusMessage: `Status saved as ${user.status}.` });
            }),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to change status. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isUpdating: false }))
          );
        })
      )
    ),
    selectUser(user: IUserResponse): void {
      patchState(store, { error: '', statusMessage: '' });
      _data.selectedUser.set(user);
    },
    exportUsers: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isExporting: true, error: '' })),
        switchMap(() =>
          _http.get('/users/export/csv', { responseType: 'blob' }).pipe(
            tap((csv) => {
              const urlApi = _document.defaultView?.URL;
              if (!urlApi) return;

              const url = urlApi.createObjectURL(csv);
              const link = _document.createElement('a');
              link.href = url;
              link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
              urlApi.revokeObjectURL(url);
            }),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to export users. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isExporting: false }))
          )
        )
      )
    ),
    clearError(): void {
      patchState(store, { error: '' });
    }
  }))
);
