import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { ApiPaginatedResponse } from '@api/shared/decorators';
import { FilterRolesDto } from '../dto';
import { RoleResponse } from '../interfaces';
import { Role } from '../entities';
import { HasRoles } from '@api/modules/auth/decorators';
import { Roles } from '@api/modules/auth/enums';
import { FindRoleById, FindRoles } from '../queries';

@ApiTags('roles')
@Controller('roles')
export class RolesController extends AbstractController {
  @Get()
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'List roles with pagination (admin only)' })
  @ApiPaginatedResponse(
    RoleResponse,
    'Roles as a [items, total] tuple. With no query parameters, returns all roles. Otherwise, defaults to page 1 and 20 items per page.'
  )
  findAll(@Query() query: FilterRolesDto): Promise<[Role[], number]> {
    return this.queryHandler.execute(new FindRoles(query));
  }

  @Get(':id')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Find a role by id (admin only)' })
  @ApiOkResponse({ type: RoleResponse, description: 'Role found' })
  findOne(@Param('id') id: string): Promise<Role> {
    return this.queryHandler.execute(new FindRoleById(id));
  }
}
