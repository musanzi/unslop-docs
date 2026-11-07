import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SignOut } from '../impl';

@CommandHandler(SignOut)
export class SignOutHandler implements ICommandHandler<SignOut, void> {
  async execute(command: SignOut): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      command.request.session.destroy((error) => (error ? reject(error) : resolve()));
    });
  }
}
