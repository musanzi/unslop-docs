import { Component } from '@angular/core';
import { AuthSignIn } from '@web/domains/auth/modules/sign-in/features/sign-in/sign-in';

@Component({
  selector: 'app-landing',
  imports: [AuthSignIn],
  templateUrl: './landing.html'
})
export class Landing {}
