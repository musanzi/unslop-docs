import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'landing-hero',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './hero.html'
})
export class LandingHero {
  isAuthenticated = input(false);
  isLoading = input(false);

  signOut = output<void>();
}
