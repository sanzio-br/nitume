import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpCodes1789994137303 implements MigrationInterface {
  name = 'AddOtpCodes1789994137303';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."otp_channel_enum" AS ENUM('phone', 'email')`,
    );
    await queryRunner.query(
      `CREATE TABLE "otp_codes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "channel" "public"."otp_channel_enum" NOT NULL, "target" character varying(320) NOT NULL, "codeHash" character varying(64) NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "resendLockUntil" TIMESTAMP WITH TIME ZONE, "consumedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_otp_codes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_otp_codes_channel_target" ON "otp_codes" ("channel", "target")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_otp_codes_channel_target"`);
    await queryRunner.query(`DROP TABLE "otp_codes"`);
    await queryRunner.query(`DROP TYPE "public"."otp_channel_enum"`);
  }
}