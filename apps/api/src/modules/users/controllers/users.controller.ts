import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { ApiPaginatedResponse } from '@api/shared/decorators';
import { createCsvUploadOptions } from '@api/shared/helpers';
import { CreateUserDto, ExportUsersDto, FilterUsersDto, UpdateUserDto } from '../dto';
import { IUserResponse, UserResponse } from '../interfaces';
import { User } from '../entities';
import { CurrentUser, HasRoles } from '@api/modules/auth/decorators';
import { Roles } from '@api/modules/auth/enums';
import { createDiskUploadOptions } from '@api/shared/helpers';
import { Response } from 'express';
import { CreateUser, DeleteUser, ImportUsersCsv, UpdateUser, UploadUserAvatar } from '../commands';
import { ExportUsersCsv, FindUserByEmail, FindUsers } from '../queries';

@ApiTags('users')
@Controller('users')
export class UsersController extends AbstractController {
  @Post()
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Create a user (admin only)' })
  @ApiCreatedResponse({ type: UserResponse, description: 'User created' })
  create(@Body() dto: CreateUserDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new CreateUser(dto));
  }

  @Get()
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'List users with pagination (admin only)' })
  @ApiPaginatedResponse(
    UserResponse,
    'Paginated users as a [items, total] tuple. Defaults to page 1 and 20 items per page.'
  )
  findAll(@Query() query: FilterUsersDto): Promise<[IUserResponse[], number]> {
    return this.queryHandler.execute(new FindUsers(query));
  }

  @Post('import/csv')
  @HasRoles([Roles.ADMIN])
  @UseInterceptors(FileInterceptor('file', createCsvUploadOptions()))
  @ApiOperation({ summary: 'Import users from a CSV file (admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } }
    }
  })
  @ApiOkResponse({ description: 'Users imported' })
  importCsv(@UploadedFile() file: Express.Multer.File): Promise<void> {
    return this.commandHandler.execute(new ImportUsersCsv(file));
  }

  @Get('export/csv')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Export users as a CSV file (admin only)' })
  @ApiOkResponse({
    description: 'CSV file',
    schema: { type: 'string', format: 'binary' }
  })
  async exportCSV(@Query() query: ExportUsersDto, @Res() res: Response): Promise<void> {
    await this.queryHandler.execute(new ExportUsersCsv(query, res));
  }

  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('avatar', createDiskUploadOptions('profiles')))
  @ApiOperation({ summary: 'Upload the current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } }
    }
  })
  @ApiOkResponse({ type: UserResponse, description: 'Avatar uploaded' })
  uploadImage(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File): Promise<IUserResponse> {
    return this.commandHandler.execute(new UploadUserAvatar(user.id, file));
  }

  @Get(':email')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Find a user by email (admin only)' })
  @ApiOkResponse({ type: UserResponse, description: 'User found' })
  findOneByEmail(@Param('email') email: string): Promise<IUserResponse> {
    return this.queryHandler.execute(new FindUserByEmail(email));
  }

  @Patch(':id')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Update a user (admin only)' })
  @ApiOkResponse({ type: UserResponse, description: 'User updated' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<IUserResponse> {
    return this.commandHandler.execute(new UpdateUser(id, dto));
  }

  @Delete(':id')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiOkResponse({ description: 'User deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.commandHandler.execute(new DeleteUser(id));
  }
}
