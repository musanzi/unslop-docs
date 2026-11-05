import { Component, inject } from '@angular/core';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { LandingCta, LandingFeatures, LandingHero } from '@web/domains/website/modules/landing/ui';

@Component({
  selector: 'app-landing',
  imports: [LandingHero, LandingFeatures, LandingCta],
  templateUrl: './landing.html'
})
export class Landing {
  protected readonly authStore = inject(AuthStore);

  protected signOut(): void {
    this.authStore.signOut();
  }
}
