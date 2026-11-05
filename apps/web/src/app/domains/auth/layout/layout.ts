import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';

import { PageLoader } from '@web/shared/ui';

@Component({
  selector: 'auth-layout',
  imports: [RouterOutlet, PageLoader],
  templateUrl: './layout.html'
})
export class AuthLayout {
  private readonly route = inject(ActivatedRoute);

  protected readonly content = signal({
    asideTitle: 'Return to your workspace',
    asideDescription: 'Sign in to a clear, modular application base that is ready to grow with your features.',
    asideFootnote: 'Keep a consistent authentication flow while you build the rest of your product.'
  });

  protected updateContent(): void {
    this.content.set(this.route.firstChild?.snapshot.data['authContent'] ?? this.content());
  }
}
