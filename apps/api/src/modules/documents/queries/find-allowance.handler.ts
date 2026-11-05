import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { MonthlyAllowance } from '../monthly-allowance';
import { AllowanceResponse } from '../dto/allowance-response';

export class FindAllowance {
  constructor(public readonly ownerId: string) {}
}

@QueryHandler(FindAllowance)
export class FindAllowanceHandler implements IQueryHandler<FindAllowance, AllowanceResponse> {
  constructor(
    private readonly database: DataSource,
    private readonly allowance: MonthlyAllowance
  ) {}

  execute({ ownerId }: FindAllowance): Promise<AllowanceResponse> {
    return this.allowance.read(this.database, ownerId);
  }
}
