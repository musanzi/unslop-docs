import { PGlite } from '@electric-sql/pglite';
import { DocumentAssessment1793880300000 } from '../../modules/database/migrations/1793880300000-DocumentAssessment';
import { DocumentRevision1793880400000 } from '../../modules/database/migrations/1793880400000-DocumentRevision';
import { ProviderRetries1793880500000 } from '../../modules/database/migrations/1793880500000-ProviderRetries';
import { MonthlyAllowance1793880600000 } from '../../modules/database/migrations/1793880600000-MonthlyAllowance';
import { RevisionNotices1793880800000 } from '../../modules/database/migrations/1793880800000-RevisionNotices';
import { AssessThenUnslopify1793880900000 } from '../../modules/database/migrations/1793880900000-AssessThenUnslopify';

export async function createDocumentTestSchema(database: PGlite): Promise<void> {
  const queryRunner = { query: async (sql: string) => (await database.query(sql)).rows };
  await database.exec(`CREATE TABLE "user" (id uuid PRIMARY KEY, status varchar NOT NULL DEFAULT 'FREE');
    CREATE TABLE document (id uuid PRIMARY KEY, "ownerId" uuid NOT NULL REFERENCES "user"(id), "originalKey" text, size integer, "createdAt" timestamptz DEFAULT now());`);
  await new DocumentAssessment1793880300000().up(queryRunner);
  await new DocumentRevision1793880400000().up(queryRunner);
  await new ProviderRetries1793880500000().up(queryRunner);
  await new MonthlyAllowance1793880600000().up(queryRunner);
  await new RevisionNotices1793880800000().up(queryRunner);
  await new AssessThenUnslopify1793880900000().up(queryRunner);
}
