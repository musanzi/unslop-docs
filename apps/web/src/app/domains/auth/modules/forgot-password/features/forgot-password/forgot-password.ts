import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { Message } from '@web/shared/ui';

import { ForgotPasswordStore } from '@web/domains/auth/modules/forgot-password/data-access';

@Component({
  selector: 'auth-forgot-password',
  templateUrl: './forgot-password.html',
  providers: [ForgotPasswordStore],
  imports: [MatFormFieldModule, RouterLink, MatInputModule, MatButtonModule, MatIconModule, FormField, Message]
})
export class AuthForgotPassword {
  protected readonly authStore = inject(ForgotPasswordStore);
  protected forgotPasswordFormModel = signal({
    email: ''
  });
  protected forgotPasswordForm = form(this.forgotPasswordFormModel, (form) => {
    required(form.email, { message: 'You must enter an email address' });
    email(form.email, { message: 'You must enter a valid email address' });
  });

  forgotPassword(event: Event) {
    event.preventDefault();
    submit(this.forgotPasswordForm, async () => {
      this.authStore.forgotPassword(this.forgotPasswordFormModel());
    });
  }
}
