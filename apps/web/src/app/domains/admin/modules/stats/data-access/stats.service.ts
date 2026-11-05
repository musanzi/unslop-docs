import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';
import type { IStatItem } from '@unslop-docs/api-contracts';

@Service()
export class StatsService {
  readonly stats = httpResource<IStatItem[]>(() => '/stats');
}
