import { Component, computed, DestroyRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { Media } from '@web/core/media';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { PageLoader, Sidebar, User } from '@web/shared/ui';

import Profile from '@web/domains/common/modules/profile/features/profile/profile';

import { NAVIGATION } from '@web/domains/user/shared/data';

@Component({
  selector: 'user-layout',
  imports: [
    MatIconModule,
    MatButtonModule,
    RouterOutlet,
    Sidebar,
    MatSidenavContainer,
    MatSidenav,
    MatSidenavContent,
    PageLoader,
    User
  ],
  template: `
    <a href="#user-content" class="sr-only focus:not-sr-only focus:p-3">Aller au contenu principal</a>
    @defer (on immediate) {
      <mat-sidenav-container>
        <mat-sidenav
          class="w-70"
          [mode]="isMobile() ? 'over' : 'side'"
          [opened]="!isMobile()"
          [disableClose]="!isMobile()"
          aria-label="Navigation"
          fixedInViewport
          #sidenav="matSidenav">
          <sidebar
            [navigation]="navigation"
            [user]="authStore.user()"
            (editProfile)="openProfile()"
            (signedOut)="authStore.signOut()" />
        </mat-sidenav>

        <mat-sidenav-content class="flex flex-col lg:h-dvh lg:overflow-hidden">
          <div class="flex items-center border-b bg-white px-4 py-2.5 text-neutral-950">
            <button matIconButton aria-label="Ouvrir ou fermer le menu" (click)="sidenav.toggle()">
              <mat-icon svgIcon="panel-left" />
            </button>

            <div class="mx-3 h-5 border-l"></div>
            <div class="min-w-0 flex-auto truncate pr-3 text-sm font-medium">Mon compte</div>
            <user
              class="shrink-0"
              [compact]="true"
              [user]="authStore.user()"
              (editProfile)="openProfile()"
              (signedOut)="authStore.signOut()" />
          </div>

          <main id="user-content" class="flex flex-col lg:min-h-0 lg:flex-auto lg:overflow-auto" tabindex="-1">
            <router-outlet />
          </main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    } @placeholder {
      <app-page-loader />
    } @loading {
      <app-page-loader />
    }
  `
})
export class UserLayout {
  protected readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly sidenav = viewChild(MatSidenav);
  private profileDialog?: MatDialogRef<Profile>;
  private readonly media = inject(Media);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.profileDialog?.close());
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        if (this.isMobile()) void this.sidenav()?.close();
      });
  }

  protected openProfile(): void {
    if (this.profileDialog) return;
    const ref = this.dialog.open(Profile, {
      width: '30rem',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: 'calc(100dvh - 2rem)',
      ariaLabelledBy: 'profile-dialog-heading',
      autoFocus: 'first-heading',
      closePredicate: (_result, _config, component) => !(component instanceof Profile) || !component.isSaving()
    });
    this.profileDialog = ref;
    ref.afterClosed().subscribe(() => {
      this.profileDialog = undefined;
    });
  }

  protected readonly navigation = NAVIGATION;
  protected readonly isMobile = computed(() => this.media.match('(max-width: 1023px)')());
}
