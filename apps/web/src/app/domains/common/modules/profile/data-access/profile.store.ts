import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { IUpdatePasswordDto, IUpdateProfileDto, IUserResponse } from '@unslop-docs/api-contracts';
import { catchError, concatMap, EMPTY, finalize, pipe, tap } from 'rxjs';

import { getApiErrorMessage } from '@/app/core/api';
import { AuthStore } from '@web/domains/auth/shared/data-access';

import { IProfileState } from '@web/domains/common/modules/profile/interfaces';

const initialState: IProfileState = {
  isUpdatingProfile: false,
  isUpdatingProfileImage: false,
  isUpdatingPassword: false,
  profileUpdated: false,
  profileImageUpdated: false,
  passwordUpdated: false,
  profileError: '',
  profileImageError: '',
  passwordError: ''
};

export const ProfileStore = signalStore(
  withState(initialState),
  withProps(() => ({
    _authStore: inject(AuthStore),
    _http: inject(HttpClient)
  })),
  withMethods(({ _authStore, _http, ...store }) => ({
    updateProfile: rxMethod<IUpdateProfileDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isUpdatingProfile: true, profileUpdated: false, profileError: '' });
          return _http.patch<IUserResponse>('/auth/me/update', payload).pipe(
            tap((user) => {
              _authStore.setUser(user);
              patchState(store, { profileUpdated: true });
            }),
            catchError((error: unknown) => {
              patchState(store, {
                profileError: getApiErrorMessage(error, 'Impossible de mettre à jour le profil. Veuillez réessayer.')
              });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isUpdatingProfile: false }))
          );
        })
      )
    ),
    updateProfileImage: rxMethod<File>(
      pipe(
        concatMap((image) => {
          patchState(store, { isUpdatingProfileImage: true, profileImageUpdated: false, profileImageError: '' });
          const body = new FormData();
          body.append('avatar', image);

          return _http.post<IUserResponse>('/users/profile/avatar', body).pipe(
            tap((user) => {
              _authStore.setUser(user);
              patchState(store, { profileImageUpdated: true });
            }),
            catchError((error: unknown) => {
              patchState(store, {
                profileImageError: getApiErrorMessage(
                  error,
                  'Impossible de modifier la photo de profil. Veuillez réessayer.'
                )
              });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isUpdatingProfileImage: false }))
          );
        })
      )
    ),
    updatePassword: rxMethod<IUpdatePasswordDto>(
      pipe(
        concatMap((payload) => {
          patchState(store, { isUpdatingPassword: true, passwordUpdated: false, passwordError: '' });
          return _http.patch<IUserResponse>('/auth/password/update', payload).pipe(
            tap((user) => {
              _authStore.setUser(user);
              patchState(store, { passwordUpdated: true });
            }),
            catchError((error: unknown) => {
              patchState(store, {
                passwordError: getApiErrorMessage(
                  error,
                  'Impossible de mettre à jour le mot de passe. Veuillez réessayer.'
                )
              });
              return EMPTY;
            }),
            finalize(() => patchState(store, { isUpdatingPassword: false }))
          );
        })
      )
    ),
    clearProfileMessage(): void {
      patchState(store, { profileUpdated: false, profileError: '' });
    },
    clearProfileImageMessage(): void {
      patchState(store, { profileImageUpdated: false, profileImageError: '' });
    },
    clearPasswordMessage(): void {
      patchState(store, { passwordUpdated: false, passwordError: '' });
    }
  }))
);
