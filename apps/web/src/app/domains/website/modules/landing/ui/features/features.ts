import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'landing-features',
  imports: [MatIconModule],
  templateUrl: './features.html'
})
export class LandingFeatures {
  protected readonly features = [
    {
      icon: 'route',
      title: 'Consistent application flow',
      description: 'Public pages, authentication, and dashboard follow a clear structure from the start.'
    },
    {
      icon: 'palette',
      title: 'Clean Material interface',
      description: 'Angular Material and Tailwind are already combined in a simple styling base.'
    },
    {
      icon: 'layers',
      title: 'Readable architecture',
      description: 'Pages compose UI sections while services and stores stay in data-access.'
    }
  ];
}
