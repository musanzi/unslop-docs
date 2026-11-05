import { Query } from '@nestjs/cqrs';
import { StatusChangeResponse } from '../../interfaces/status-change-response';

export class FindStatusChanges extends Query<StatusChangeResponse[]> {
  constructor(public readonly userId: string) {
    super();
  }
}
