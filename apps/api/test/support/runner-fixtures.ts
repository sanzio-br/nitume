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
