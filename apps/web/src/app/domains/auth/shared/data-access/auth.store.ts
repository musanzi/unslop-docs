import { HttpClient } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, exhaustMap, finalize, map, of, pipe, tap } from 'rxjs';

import { IAuthState } from '@web/domains/auth/shared/interfaces';

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<IAuthState>({ user: null, isSigningOut: false, signOutError: '' }),
  withProps(() => ({
    _http: inject(HttpClient),
    _router: inject(Router)
  })),
  withComputed(({ user }) => ({
    isAdmin: computed(() => {
      return user()?.isAdmin === true;
    }),
    isUser: computed(() => {
      return user()?.roles?.some((r) => r === 'user');
    })
  })),
  withMethods(({ _http, _router, ...store }) => ({
    initialize: () => {
      return _http.get<IUserResponse>('/auth/me').pipe(
        map((user) => {
          patchState(store, { user });
          return user;
        }),
        catchError(() => {
          patchState(store, { user: null });
          return of(null);
        })
      );
    },
    signOut: rxMethod<void>(
      pipe(
        exhaustMap(() => {
          patchState(store, { isSigningOut: true, signOutError: '' });
          return _http.post<null>('/auth/signout', {}).pipe(
            tap(() => {
              patchState(store, { user: null });
              void _router.navigate(['/auth/sign-in']);
            }),
            catchError(() => {
              patchState(store, { signOutError: 'Unable to sign out. Please try again.' });
              return of(null);
            }),
            finalize(() => patchState(store, { isSigningOut: false }))
          );
        })
      )
    ),
    setUser: (user: IUserResponse | null) => {
      patchState(store, { user });
    }
  }))
);
