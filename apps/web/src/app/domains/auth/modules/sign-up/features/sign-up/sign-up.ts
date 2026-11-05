import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { Message } from '@web/shared/ui';

import { SignUpStore } from '@web/domains/auth/modules/sign-up/data-access';

@Component({
  selector: 'auth-sign-up',
  templateUrl: './sign-up.html',
  providers: [SignUpStore],
  imports: [RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, FormField, Message]
})
export class AuthSignUp {
  protected readonly authStore = inject(SignUpStore);
  protected signUpFormModel = signal({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  protected signUpForm = form(this.signUpFormModel, (form) => {
    required(form.name, { message: 'You must enter your name' });
    required(form.email, { message: 'You must enter an email address' });
    email(form.email, { message: 'You must enter a valid email address' });
    required(form.password, { message: 'You must enter a password' });
    required(form.confirmPassword, { message: 'You must confirm your password' });
    validate(form.confirmPassword, ({ value, valueOf }) => {
      if (value() !== valueOf(form.password)) {
        return {
          kind: 'passwordMismatch',
          message: 'Passwords do not match'
        };
      }
      return null;
    });
  });

  signUp(event: Event) {
    event.preventDefault();
    submit(this.signUpForm, async () => {
      const { email, name, password } = this.signUpFormModel();
      this.authStore.signUp({ email, name, password });
    });
  }
}
