import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { User } from '../user/user';

@Component({
  selector: 'sidebar',
  imports: [User, RouterLink, RouterLinkActive, MatIcon],
  templateUrl: './sidebar.html'
})
export class Sidebar {}
