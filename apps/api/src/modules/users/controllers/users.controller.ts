import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { UpdateStatusDto } from '../dto/update-status.dto';
import { StatusChangeResponse } from '../interfaces/status-change-response';
import { UpdateStatus } from '../commands/impl/update-status.command';
import { FindStatusChanges } from '../queries/impl/find-status-changes.query';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { ApiPaginatedResponse } from '@api/shared/decorators';
import { ExportUsersDto, FilterUsersDto } from '../dto';
import { IUserResponse, UserResponse } from '../interfaces';
import { CurrentUser, HasRoles } from '@api/modules/auth/decorators';
import { Roles } from '@api/modules/auth/enums';
import { createDiskUploadOptions } from '@api/shared/helpers';
import { Response } from 'express';
import { UploadUserAvatar } from '../commands';
import { ExportUsersCsv, FindUserByEmail, FindUsers } from '../queries';

@ApiTags('users')
@Controller('users')
export class UsersController extends AbstractController {
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
  async uploadImage(
    @CurrentUser() user: IUserResponse,
    @UploadedFile() file: Express.Multer.File
  ): Promise<IUserResponse> {
    const updated = await this.commandHandler.execute(new UploadUserAvatar(user.id, file));
    return { ...updated, isAdmin: user.isAdmin };
  }

  @Patch(':id/status')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Change a user status and record the change (admin only)' })
  @ApiOkResponse({ type: UserResponse })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() admin: IUserResponse
  ): Promise<IUserResponse> {
    return this.commandHandler.execute(new UpdateStatus(id, body.status, admin));
  }

  @Get(':id/status-changes')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Read status changes, newest first (admin only)' })
  @ApiOkResponse({ type: [StatusChangeResponse] })
  findStatusChanges(@Param('id') id: string): Promise<StatusChangeResponse[]> {
    return this.queryHandler.execute(new FindStatusChanges(id));
  }

  @Get(':email')
  @HasRoles([Roles.ADMIN])
  @ApiOperation({ summary: 'Find a user by email (admin only)' })
  @ApiOkResponse({ type: UserResponse, description: 'User found' })
  findOneByEmail(@Param('email') email: string): Promise<IUserResponse> {
    return this.queryHandler.execute(new FindUserByEmail(email));
  }
}
