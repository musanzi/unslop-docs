import { Component, computed, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import type { IUserResponse } from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { ProfileDialog } from '@web/domains/common/modules/profile/data-access/profile-dialog';
import { environment } from '@web/environments/environment';
import { subscriptionPlans } from '@web/shared/data/subscription-plans';

@Component({ selector: 'user', imports: [MatIcon], templateUrl: './user.html' })
export class User {
  readonly subscriptionStatus = input<IUserResponse['status']>();
  protected readonly auth = inject(AuthStore);
  protected readonly profile = inject(ProfileDialog);
  protected readonly subscription = computed(() => {
    const status = this.subscriptionStatus() ?? this.auth.user()?.status;
    return status ? subscriptionPlans[status] : null;
  });
  protected readonly avatarImageUrl = computed(() => {
    const avatar = this.auth.user()?.avatar;
    return avatar
      ? /^https?:\/\//i.test(avatar)
        ? avatar
        : `${environment.apiUrl}/uploads/profiles/${avatar}`
      : '/images/avatar.webp';
  });
}
