import { Query } from '@nestjs/cqrs';
import { IStatItem } from '../../interfaces';

export class FindStats extends Query<IStatItem[]> {}
