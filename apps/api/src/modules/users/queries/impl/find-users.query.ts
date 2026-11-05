import { Query } from '@nestjs/cqrs';
import { FilterUsersDto } from '../../dto';
import { IUserResponse } from '../../interfaces';

export class FindUsers extends Query<[IUserResponse[], number]> {
  constructor(public readonly params: FilterUsersDto) {
    super();
  }
}
