import { Command } from '@nestjs/cqrs';
import { IUserResponse } from '../../interfaces';

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatar?: string;
}

export class FindOrCreateUser extends Command<IUserResponse> {
  constructor(public readonly identity: GoogleIdentity) {
    super();
  }
}
