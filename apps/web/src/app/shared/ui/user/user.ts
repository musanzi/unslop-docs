import { Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { ProfileDialog } from '@web/domains/common/modules/profile/data-access/profile-dialog';
import { environment } from '@web/environments/environment';

@Component({ selector: 'user', imports: [MatIcon], templateUrl: './user.html' })
export class User {
  protected readonly auth = inject(AuthStore);
  protected readonly profile = inject(ProfileDialog);
  protected readonly avatarImageUrl = computed(() => {
    const avatar = this.auth.user()?.avatar;
    return avatar
      ? /^https?:\/\//i.test(avatar)
        ? avatar
        : `${environment.apiUrl}/uploads/profiles/${avatar}`
      : '/images/avatar.webp';
  });
}
