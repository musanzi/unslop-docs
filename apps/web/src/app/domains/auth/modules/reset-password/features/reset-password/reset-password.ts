import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, minLength, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Message } from '@web/shared/ui';

import { ResetPasswordStore } from '@web/domains/auth/modules/reset-password/data-access';

@Component({
  selector: 'auth-reset-password',
  templateUrl: './reset-password.html',
  providers: [ResetPasswordStore],
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, FormField, Message]
})
export class AuthResetPassword {
  private readonly route = inject(ActivatedRoute);
  protected readonly authStore = inject(ResetPasswordStore);
  protected token = signal(this.route.snapshot.queryParamMap.get('token') ?? '');
  protected hasToken = computed(() => this.token().trim().length > 0);
  protected resetPasswordFormModel = signal({
    password: '',
    confirmPassword: ''
  });
  protected resetPasswordForm = form(this.resetPasswordFormModel, (form) => {
    required(form.password, { message: 'You must enter a password' });
    minLength(form.password, 6, { message: 'The password must contain at least 6 characters' });
    required(form.confirmPassword, {
      message: 'You must confirm your password'
    });
    validate(form.confirmPassword, (ctx) => {
      const password = ctx.valueOf(form.password);
      const confirmPassword = ctx.value();

      if (!password || !confirmPassword) return null;

      if (password !== confirmPassword) {
        return {
          kind: 'mismatch',
          message: 'Passwords do not match'
        };
      }

      return null;
    });
  });

  resetPassword(event: Event) {
    event.preventDefault();
    if (!this.hasToken()) return;

    submit(this.resetPasswordForm, async () => {
      this.authStore.resetPassword({
        password: this.resetPasswordFormModel().password,
        token: this.token()
      });
    });
  }
}
