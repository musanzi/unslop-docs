import { FindOrCreateUserHandler } from './find-or-create-user.handler';
import { UpdateUserHandler } from './update-user.handler';
import { UploadUserAvatarHandler } from './upload-user-avatar.handler';

export const CommandHandlers = [FindOrCreateUserHandler, UpdateUserHandler, UploadUserAvatarHandler];
