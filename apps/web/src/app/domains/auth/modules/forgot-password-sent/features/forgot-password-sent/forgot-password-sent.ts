import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'auth-forgot-password-sent',
  templateUrl: './forgot-password-sent.html',
  imports: [RouterLink, MatIconModule]
})
export class AuthForgotPasswordSent {}
