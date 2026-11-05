import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { ICreateUserDto, IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, switchMap, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

import { IRemoveUserCommand, IUpdateUserCommand, IUsersState } from '@web/domains/admin/modules/users/interfaces';

import { UsersService } from './users.service';

const initialState: IUsersState = {
  isSaving: false,
  isExporting: false,
  removingUserId: '',
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
    createUser: rxMethod<ICreateUserDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isSaving: true, error: '' });
          return _http.post<IUserResponse>('/users', payload).pipe(
            tap(() => _data.list.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to create the user. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isSaving: false }))
          );
        })
      )
    ),
    updateUser: rxMethod<IUpdateUserCommand>(
      pipe(
        concatMap(({ id, payload }) => {
          patchState(store, { isSaving: true, error: '' });
          return _http.patch<IUserResponse>(`/users/${id}`, payload).pipe(
            tap(() => _data.list.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to update the user. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isSaving: false }))
          );
        })
      )
    ),
    removeUser: rxMethod<IRemoveUserCommand>(
      pipe(
        concatMap(({ id }) => {
          patchState(store, { removingUserId: id, error: '' });
          return _http.delete<null>(`/users/${id}`).pipe(
            tap(() => _data.list.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to delete the user. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { removingUserId: '' }))
          );
        })
      )
    ),
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
