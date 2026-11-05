import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { ISignUpDto, IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';

export const SignUpStore = signalStore(
  withState({ isLoading: false, error: '' }),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router)
  })),
  withMethods(({ _http, _router, ...store }) => ({
    signUp: rxMethod<ISignUpDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isLoading: true, error: '' });
          return _http.post<IUserResponse>('/auth/signup', payload).pipe(
            tap(() => {
              void _router.navigate(['/auth/sign-in']);
            }),
            catchError((error: unknown) => {
              patchState(store, {
                error: getApiErrorMessage(error, 'Unable to create your account. Check your information and try again.')
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
