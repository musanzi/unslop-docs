import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { environment } from '@web/environments/environment';

@Component({
  selector: 'auth-sign-in',
  templateUrl: './sign-in.html',
  imports: [MatButtonModule, MatIconModule]
})
export class AuthSignIn {
  protected readonly googleSignInUrl = `${environment.apiUrl}/auth/signin/google`;
  private readonly error = inject(ActivatedRoute).snapshot.queryParamMap.get('error');
  protected readonly message =
    this.error === 'google-cancelled'
      ? 'Google sign-in was cancelled. Continue with Google when you are ready.'
      : this.error
        ? 'Google sign-in could not be completed. Please try again with a verified Google account.'
        : '';
}
