import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { IForgotPasswordDto } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

export const ForgotPasswordStore = signalStore(
  withState({ isLoading: false, error: '' }),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router)
  })),
  withMethods(({ _http, _router, ...store }) => ({
    forgotPassword: rxMethod<IForgotPasswordDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isLoading: true, error: '' });
          return _http.post<null>('/auth/password/forgot', payload).pipe(
            tap(() => {
              void _router.navigate(['/auth/forgot-password-sent']);
            }),
            catchError((error: unknown) => {
              patchState(store, {
                error: getApiErrorMessage(error, 'Unable to send the reset link. Please try again.')
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
