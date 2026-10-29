import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #24 (owner WQ-22 and WQ-23, 2026-10-28): every account status change
 * made by an admin (suspend, ban, reactivate) is recorded here with the
 * actor, the previous and new status and the required internal reason
 * (10-500 characters after trimming, checked by the API; never shown to the
 * user). Written in the same transaction as the `users.status` update. Kept for the life of the
 * account (no purge): `userId` and `actorUserId` are ON DELETE RESTRICT.
 * Append-only: triggers reject UPDATE, DELETE and TRUNCATE. Reversible.
 *
 * `actorUserId` may be null only for a `system` actor (the approved "nullable
 * only for a system actor"); this also covers the approved "not null when
 * actorType = admin".
 */
export class AddUserStatusHistory1790103600000 implements MigrationInterface {
  name = 'AddUserStatusHistory1790103600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "fromStatus" "public"."user_status_enum" NOT NULL,
        "toStatus" "public"."user_status_enum" NOT NULL,
        "actorType" "public"."status_history_actor_enum" NOT NULL,
        "actorUserId" uuid,
        "reason" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_user_status_history_changed" CHECK ("fromStatus" <> "toStatus"),
        CONSTRAINT "CHK_user_status_history_actor" CHECK ("actorType" = 'system' OR "actorUserId" IS NOT NULL)
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_status_history_user_created" ON "user_status_history" ("userId", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_status_history_actor_created" ON "user_status_history" ("actorUserId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_status_history" ADD CONSTRAINT "FK_user_status_history_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_status_history" ADD CONSTRAINT "FK_user_status_history_actor" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "user_status_history_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'user_status_history is append-only';
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_user_status_history_append_only" BEFORE UPDATE OR DELETE ON "user_status_history" FOR EACH ROW EXECUTE FUNCTION "user_status_history_append_only"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_user_status_history_no_truncate" BEFORE TRUNCATE ON "user_status_history" FOR EACH STATEMENT EXECUTE FUNCTION "user_status_history_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_user_status_history_no_truncate" ON "user_status_history"`);
    await queryRunner.query(`DROP TRIGGER "TRG_user_status_history_append_only" ON "user_status_history"`);
    await queryRunner.query(`DROP FUNCTION "user_status_history_append_only"()`);
    await queryRunner.query(`DROP TABLE "user_status_history"`);
  }
}
