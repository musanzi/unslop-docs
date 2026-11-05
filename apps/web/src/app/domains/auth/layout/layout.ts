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
    asideTitle: 'Welcome to unslop-docs',
    asideDescription: 'Document editing for students, with your meaning and language at the center.',
    asideFootnote: 'Google sign-in and profile management are available. Document processing is in development.'
  });

  protected updateContent(): void {
    this.content.set(this.route.firstChild?.snapshot.data['authContent'] ?? this.content());
  }
}
