import { UpdateStatusHandler } from './update-status.handler';
import { FindOrCreateUserHandler } from './find-or-create-user.handler';
import { UpdateUserHandler } from './update-user.handler';
import { UploadUserAvatarHandler } from './upload-user-avatar.handler';

export const CommandHandlers = [
  UpdateStatusHandler,
  FindOrCreateUserHandler,
  UpdateUserHandler,
  UploadUserAvatarHandler
];
