import { PGlite } from '@electric-sql/pglite';
import { QueryRunner } from 'typeorm';
import { Init1794049887155 } from '../../modules/database/migrations/1794049887155-Init';

export async function createDocumentTestSchema(database: PGlite): Promise<void> {
  await database.exec(`CREATE FUNCTION uuid_generate_v4() RETURNS uuid AS 'SELECT gen_random_uuid()' LANGUAGE sql`);
  const runner = {
    query: async (sql: string) => {
      if (!sql.startsWith('CREATE EXTENSION')) await database.exec(sql);
    }
  } as unknown as QueryRunner;
  await new Init1794049887155().up(runner);
  await database.exec(`ALTER TABLE "user" ALTER email DROP NOT NULL, ALTER name DROP NOT NULL;
    ALTER TABLE document ALTER "ownerId" DROP NOT NULL, ALTER filename DROP NOT NULL`);
}
