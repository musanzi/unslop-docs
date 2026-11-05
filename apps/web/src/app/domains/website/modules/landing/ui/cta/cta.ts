import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'landing-cta',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './cta.html'
})
export class LandingCta {
  isAuthenticated = input(false);
}
