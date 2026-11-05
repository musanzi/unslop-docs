import { Query } from '@nestjs/cqrs';
import { IUserResponse } from '@api/modules/users/interfaces';

export class GetProfile extends Query<IUserResponse> {
  constructor(public readonly email: string) {
    super();
  }
}
