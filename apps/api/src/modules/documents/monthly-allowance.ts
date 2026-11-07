import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobDatabase } from '../processing/document-jobs';
import { UserStatus } from '../users/user-status';
import { AllowanceResponse } from './dto/allowance-response';

@Injectable()
export class AllowanceClock {
  now(): Date {
    return new Date();
  }
}

const limits: Record<UserStatus, number> = { FREE: 3, PREMIUM: 15, GOLD: 35 };

@Injectable()
export class MonthlyAllowance {
  constructor(private readonly clock: AllowanceClock) {}

  async read(database: JobDatabase, ownerId: string, at = this.clock.now()): Promise<AllowanceResponse> {
    const month = at.toISOString().slice(0, 7);
    const resetsAt = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString();
    const rows = await database.query(
      `SELECT u.status,
      count(r.id) FILTER (WHERE r.state = 'charged')::int AS used,
      count(r.id) FILTER (WHERE r.state = 'active')::int AS reserved
      FROM "user" u LEFT JOIN allowance_reservation r ON r."ownerId" = u.id AND r.month = $2::date
        AND r.state IN ('active', 'charged')
      WHERE u.id = $1 GROUP BY u.id, u.status`,
      [ownerId, `${month}-01`]
    );
    const row = rows[0] as { status: UserStatus; used: number; reserved: number } | undefined;
    if (!row) throw new NotFoundException('User not found');
    const limit = limits[row.status];
    return { ...row, limit, remaining: Math.max(0, limit - row.used - row.reserved), month, resetsAt };
  }

  async reserve(database: JobDatabase, ownerId: string, documentId: string): Promise<void> {
    await database.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [ownerId]);
    const at = this.clock.now();
    const allowance = await this.read(database, ownerId, at);
    if (allowance.remaining === 0) {
      throw new ConflictException(
        `Your ${allowance.status} allowance of ${allowance.limit} documents is fully used or reserved. It resets on ${allowance.resetsAt} (UTC).`
      );
    }
    await database.query(
      `INSERT INTO allowance_reservation (id, "ownerId", "documentId", "reservedAt", month, state)
      VALUES ($1, $2, $3, $4, $5, 'active')`,
      [randomUUID(), ownerId, documentId, at, `${allowance.month}-01`]
    );
  }
}
