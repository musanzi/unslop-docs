import { Query } from '@nestjs/cqrs';
import { Role } from '../../entities';

export class FindRoleById extends Query<Role> {
  constructor(public readonly id: string) {
    super();
  }
}
