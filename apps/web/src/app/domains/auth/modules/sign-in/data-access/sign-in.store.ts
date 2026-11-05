import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { ISignInDto, IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { environment } from '@web/environments/environment';

export const SignInStore = signalStore(
  withState({ isLoading: false, error: '' }),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router),
    _authStore: inject(AuthStore),
    googleSignInUrl: `${environment.apiUrl}/auth/signin/google`
  })),
  withMethods(({ _http, _authStore, _router, ...store }) => ({
    signIn: rxMethod<ISignInDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isLoading: true, error: '' });
          return _http.post<IUserResponse>('/auth/signin', payload).pipe(
            tap((user) => {
              _authStore.setUser(user);
              return _authStore.isAdmin() ? _router.navigate(['/admin']) : _router.navigate(['/user']);
            }),
            catchError((error: unknown) => {
              patchState(store, { error: getApiErrorMessage(error, 'Incorrect email address or password.') });
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
