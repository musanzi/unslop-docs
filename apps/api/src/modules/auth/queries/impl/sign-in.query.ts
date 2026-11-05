import { Query } from '@nestjs/cqrs';
import { Request } from 'express';
import { IUserResponse } from '@api/modules/users/interfaces';

export class SignIn extends Query<IUserResponse> {
  constructor(public readonly request: Request) {
    super();
  }
}
