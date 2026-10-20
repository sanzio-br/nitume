import request from 'supertest';
import { DataSource } from 'typeorm';

/**
 * RA-8 (row 126): a runner may only go online, see offers and accept once
 * every required check is approved. e2e fixtures that need a working runner
 * record the five approved checks directly (phone, ID front, ID back, selfie,
 * payment identity; no image, so nothing reaches the ID storage or the
 * append-only access log) and put the runner online. Idempotent.
 *
 * Cleanup: `deleteRunnerVerifications` removes them by the tracked user ids
 * (runner_verifications has no guard trigger).
 */
export const readyRunner = async (ds: DataSource, runnerProfileId: string): Promise<void> => {
  const existing: { n: string }[] = await ds.query(
    `SELECT COUNT(*) AS n FROM "runner_verifications" WHERE "runnerProfileId" = $1 AND status::text = 'approved'`,
    [runnerProfileId],
  );
  if (Number(existing[0]?.n ?? 0) < 5) {
    await ds.query(
      `INSERT INTO "runner_verifications" ("runnerProfileId", "verificationType", side, status, "reviewedAt")
       VALUES ($1, 'phone', NULL, 'approved', now()),
              ($1, 'government_id', 'front', 'approved', now()),
              ($1, 'government_id', 'back', 'approved', now()),
              ($1, 'selfie', NULL, 'approved', now()),
              ($1, 'payment_identity', NULL, 'approved', now())`,
      [runnerProfileId],
    );
  }
  await ds.query(`UPDATE "runner_profiles" SET availability = 'online' WHERE id = $1 AND availability::text = 'offline'`, [
    runnerProfileId,
  ]);
};

/** Removes the runner rows that reference a profile (verifications, skills, areas) for the tracked users. */
export const deleteRunnerVerifications = async (ds: DataSource, userIds: string[]): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }
  for (const table of ['runner_verifications', 'runner_skills', 'runner_service_areas']) {
    await ds.query(
      `DELETE FROM "${table}" WHERE "runnerProfileId" IN
         (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
      [userIds],
    );
  }
};

/**
 * Finds one verification in the admin queue (GET /runners/verifications),
 * following `nextCursor`: parallel e2e files add their own verifications, so
 * the one under test may not be on the first page.
 */
export const findInVerificationQueue = async (
  baseUrl: string,
  adminToken: string,
  verificationId: string,
  filter: { status?: string } = {},
): Promise<Record<string, unknown> | undefined> => {
  let cursor: string | null = null;
  do {
    const page = await request(baseUrl)
      .get('/api/v1/runners/verifications')
      .query({ ...filter, limit: 100, ...(cursor ? { cursor } : {}) })
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
    const found = (page.body.items as { id: string }[]).find((v) => v.id === verificationId);
    if (found) {
      return found as Record<string, unknown>;
    }
    cursor = page.body.nextCursor as string | null;
  } while (cursor);
  return undefined;
};

/**
 * §3.3 / RA-11: IN_PROGRESS -> AWAITING_CUSTOMER needs at least one photo
 * by the runner. Uploads one (console storage in e2e). Files that delete
 * their errands must delete `evidence` rows first.
 */
export const runnerPhoto = async (baseUrl: string, runnerToken: string, errandId: string): Promise<void> => {
  await request(baseUrl)
    .post(`/api/v1/errands/${errandId}/evidence`)
    .set({ Authorization: `Bearer ${runnerToken}` })
    .send({ type: 'photo', contentType: 'image/jpeg', data: Buffer.from('photo-bytes').toString('base64') })
    .expect(201);
};
