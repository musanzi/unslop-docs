import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { ApiPaginatedResponse } from '@api/shared/decorators';
import { CreateRoleDto, FilterRolesDto, UpdateRoleDto } from '../dto';
import { RoleResponse } from '../interfaces';
import { Role } from '../entities';
import { HasRoles } from '@api/modules/auth/decorators';
import { Roles } from '@api/modules/auth/enums';
import { CreateRole, DeleteRole, UpdateRole } from '../commands';
import { FindRoleById, FindRoles } from '../queries';

@ApiTags('roles')
@Controller('roles')
export class RolesController extends AbstractController {
  @Post()
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Create a role (admin only)' })
  @ApiCreatedResponse({ type: RoleResponse, description: 'Role created' })
  create(@Body() dto: CreateRoleDto): Promise<Role> {
    return this.commandHandler.execute(new CreateRole(dto));
  }

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

  @Patch(':id')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Update a role (admin only)' })
  @ApiOkResponse({ type: RoleResponse, description: 'Role updated' })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto): Promise<Role> {
    return this.commandHandler.execute(new UpdateRole(id, updateRoleDto));
  }

  @Delete(':id')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Delete a role (admin only)' })
  @ApiOkResponse({ description: 'Role deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.commandHandler.execute(new DeleteRole(id));
  }
}
