import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '@web/environments/environment';

@Component({
  selector: 'auth-sign-in',
  templateUrl: './sign-in.html',
  imports: [RouterLink]
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
