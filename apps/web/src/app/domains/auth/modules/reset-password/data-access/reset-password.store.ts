import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { IResetPasswordDto, IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

export const ResetPasswordStore = signalStore(
  withState({ isLoading: false, error: '' }),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router)
  })),
  withMethods(({ _http, _router, ...store }) => ({
    resetPassword: rxMethod<IResetPasswordDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isLoading: true, error: '' });
          return _http.post<IUserResponse>('/auth/password/reset', payload).pipe(
            tap(() => {
              void _router.navigate(['/auth/sign-in']);
            }),
            catchError((error: unknown) => {
              patchState(store, {
                error: getApiErrorMessage(error, 'Unable to reset your password. The link may be invalid or expired.')
              });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isLoading: false }))
          );
        })
      )
    ),
    clearError(): void {
      patchState(store, { error: '' });
    }
  }))
);
