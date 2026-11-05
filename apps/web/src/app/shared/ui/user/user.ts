import { Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/list';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { IUserSummary } from '@web/shared/interfaces';
import { environment } from '@web/environments/environment';

@Component({
  selector: 'user',
  imports: [MatDivider, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger],
  templateUrl: './user.html'
})
export class User {
  readonly compact = input(false);
  readonly editProfile = output<void>();
  readonly user = input.required<IUserSummary | null>();
  readonly signedOut = output<void>();

  protected readonly avatarImageUrl = computed(() => {
    const user = this.user();

    return user?.avatar
      ? /^https?:\/\//i.test(user.avatar)
        ? user.avatar
        : `${environment.apiUrl}/uploads/profiles/${user.avatar}`
      : '/images/avatar.webp';
  });
}
