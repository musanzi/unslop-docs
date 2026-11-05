import { Query } from '@nestjs/cqrs';
import { Response } from 'express';
import { ExportUsersDto } from '../../dto';

export class ExportUsersCsv extends Query<void> {
  constructor(
    public readonly params: ExportUsersDto,
    public readonly response: Response
  ) {
    super();
  }
}
