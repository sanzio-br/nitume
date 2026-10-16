import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 115 (2026-10-13): "Runner skills use the six category
 * values, with a migration away from the current RunnerSkill enum."
 *
 * `runner_skill_enum` becomes the six errand category values
 * (buy_for_me | pickup_delivery | inspection | representation | queue_admin |
 * business). Existing rows are mapped (spec v-edit-skills):
 *   shopping -> buy_for_me, pickup_delivery / documents -> pickup_delivery,
 *   inspection / property_visits -> inspection, queuing -> queue_admin,
 *   business_errands -> business.
 * Two old skills can map to the same category for one runner; the rows are
 * merged first (the oldest row is kept, `verified` = any of them). A unique
 * index on (runnerProfileId, skill) then keeps one row per skill.
 *
 * Down maps back (pickup_delivery -> pickup_delivery, inspection ->
 * inspection; the documents / property_visits distinction is lost) and
 * refuses while a `representation` row exists (no old value for it).
 */
const UP_MAP = `CASE "skill"::text
    WHEN 'shopping' THEN 'buy_for_me'
    WHEN 'pickup_delivery' THEN 'pickup_delivery'
    WHEN 'documents' THEN 'pickup_delivery'
    WHEN 'inspection' THEN 'inspection'
    WHEN 'property_visits' THEN 'inspection'
    WHEN 'queuing' THEN 'queue_admin'
    WHEN 'business_errands' THEN 'business'
  END`;

const DOWN_MAP = `CASE "skill"::text
    WHEN 'buy_for_me' THEN 'shopping'
    WHEN 'pickup_delivery' THEN 'pickup_delivery'
    WHEN 'inspection' THEN 'inspection'
    WHEN 'queue_admin' THEN 'queuing'
    WHEN 'business' THEN 'business_errands'
  END`;

export class RunnerSkillsToCategories1790103100000 implements MigrationInterface {
  name = 'RunnerSkillsToCategories1790103100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Merge rows that map to the same category for one runner.
    await queryRunner.query(
      `WITH mapped AS (
         SELECT id, "runnerProfileId", ${UP_MAP} AS target, verified,
                ROW_NUMBER() OVER (PARTITION BY "runnerProfileId", ${UP_MAP} ORDER BY "createdAt", id) AS rn
           FROM "runner_skills"
       ), merged AS (
         SELECT "runnerProfileId", target, bool_or(verified) AS verified FROM mapped GROUP BY 1, 2
       )
       UPDATE "runner_skills" s SET verified = m.verified
         FROM mapped k JOIN merged m ON m."runnerProfileId" = k."runnerProfileId" AND m.target = k.target
        WHERE s.id = k.id AND k.rn = 1`,
    );
    await queryRunner.query(
      `DELETE FROM "runner_skills" WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY "runnerProfileId", ${UP_MAP} ORDER BY "createdAt", id) AS rn
             FROM "runner_skills") d
          WHERE d.rn > 1)`,
    );
    await queryRunner.query(`ALTER TYPE "public"."runner_skill_enum" RENAME TO "runner_skill_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."runner_skill_enum" AS ENUM('buy_for_me', 'pickup_delivery', 'inspection', 'representation', 'queue_admin', 'business')`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_skills" ALTER COLUMN "skill" TYPE "public"."runner_skill_enum" USING (${UP_MAP})::"public"."runner_skill_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."runner_skill_enum_old"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_runner_skills_profile_skill" ON "runner_skills" ("runnerProfileId", "skill")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: { n: string }[] = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM "runner_skills" WHERE "skill"::text = 'representation'`,
    );
    if (Number(rows[0]?.n ?? 0) > 0) {
      throw new Error('runner_skills has representation rows, which the old RunnerSkill enum cannot hold');
    }
    await queryRunner.query(`DROP INDEX "public"."UQ_runner_skills_profile_skill"`);
    await queryRunner.query(`ALTER TYPE "public"."runner_skill_enum" RENAME TO "runner_skill_enum_new"`);
    await queryRunner.query(
      `CREATE TYPE "public"."runner_skill_enum" AS ENUM('shopping', 'pickup_delivery', 'inspection', 'documents', 'property_visits', 'queuing', 'business_errands')`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_skills" ALTER COLUMN "skill" TYPE "public"."runner_skill_enum" USING (${DOWN_MAP})::"public"."runner_skill_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."runner_skill_enum_new"`);
  }
}
