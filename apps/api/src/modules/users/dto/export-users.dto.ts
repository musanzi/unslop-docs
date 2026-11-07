import { PickType } from '@nestjs/swagger';
import { FilterUsersDto } from './filter-users.dto';

export class ExportUsersDto extends PickType(FilterUsersDto, ['q'] as const) {}
