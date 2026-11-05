import dataSource from '../orm.config';
import { Roles } from '../../auth/enums';
import { Role } from '../../roles/entities';

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.getRepository(Role).upsert(
      Object.values(Roles).map((name) => ({ name })),
      ['name']
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
