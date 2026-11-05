import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { ICreateRoleDto, IRoleResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

import { IRemoveRoleCommand, IRolesState, IUpdateRoleCommand } from '@web/domains/admin/modules/roles/interfaces';

import { RolesService } from './roles.service';

const initialState: IRolesState = {
  isSaving: false,
  removingRoleId: '',
  error: ''
};

export const RolesStore = signalStore(
  withState(initialState),
  withProps(() => ({ _data: inject(RolesService), _http: inject(HttpClient) })),
  withMethods(({ _data, _http, ...store }) => ({
    createRole: rxMethod<ICreateRoleDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isSaving: true, error: '' });
          return _http.post<IRoleResponse>('/roles', payload).pipe(
            tap(() => _data.roles.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to create the role. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isSaving: false }))
          );
        })
      )
    ),
    updateRole: rxMethod<IUpdateRoleCommand>(
      pipe(
        concatMap(({ id, payload }) => {
          patchState(store, { isSaving: true, error: '' });
          return _http.patch<IRoleResponse>(`/roles/${id}`, payload).pipe(
            tap(() => _data.roles.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to update the role. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isSaving: false }))
          );
        })
      )
    ),
    removeRole: rxMethod<IRemoveRoleCommand>(
      pipe(
        concatMap(({ id }) => {
          patchState(store, { removingRoleId: id, error: '' });
          return _http.delete<null>(`/roles/${id}`).pipe(
            tap(() => _data.roles.reload()),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Unable to delete the role. Please try again.') });
              return EMPTY;
            }),
            finalize(() => patchState(store, { removingRoleId: '' }))
          );
        })
      )
    ),
    clearError(): void {
      patchState(store, { error: '' });
    }
  }))
);
