import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerAppModules1789997392000 implements MigrationInterface {
  name = 'AddCustomerAppModules1789997392000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method_type_enum" AS ENUM('mpesa', 'card', 'bank')`,
    );
    await queryRunner.query(`ALTER TABLE "evidence" ADD "url" character varying(512)`);
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "errandId" uuid, "eventType" character varying(100) NOT NULL, "title" character varying(255) NOT NULL, "body" text, "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_addresses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerProfileId" uuid NOT NULL, "label" character varying(50) NOT NULL, "addressText" character varying(500) NOT NULL, "lat" double precision, "lon" double precision, "isDefault" boolean NOT NULL DEFAULT 'false', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_saved_addresses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerProfileId" uuid NOT NULL, "type" "public"."payment_method_type_enum" NOT NULL, "label" character varying(100) NOT NULL, "detail" character varying(100) NOT NULL, "phoneNumber" character varying(30), "isDefault" boolean NOT NULL DEFAULT 'false', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_payment_methods" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."price_change_status_enum" AS ENUM('requested', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "price_change_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "requestedByUserId" uuid NOT NULL, "fromPrice" numeric(12,2) NOT NULL, "toPrice" numeric(12,2) NOT NULL, "reason" character varying(500), "status" "public"."price_change_status_enum" NOT NULL DEFAULT 'requested', "decidedByUserId" uuid, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_price_change_requests" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user" ON "notifications" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_errand" ON "notifications" ("errandId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_addresses_profile" ON "saved_addresses" ("customerProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_methods_profile" ON "payment_methods" ("customerProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_change_errand" ON "price_change_requests" ("errandId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_change_requested_by" ON "price_change_requests" ("requestedByUserId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_addresses" ADD CONSTRAINT "FK_saved_addresses_profile" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_payment_methods_profile" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_change_requests" ADD CONSTRAINT "FK_price_change_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_change_requests" ADD CONSTRAINT "FK_price_change_requester" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "price_change_requests" DROP CONSTRAINT "FK_price_change_requester"`);
    await queryRunner.query(`ALTER TABLE "price_change_requests" DROP CONSTRAINT "FK_price_change_errand"`);
    await queryRunner.query(`ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_payment_methods_profile"`);
    await queryRunner.query(`ALTER TABLE "saved_addresses" DROP CONSTRAINT "FK_saved_addresses_profile"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_errand"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_price_change_requested_by"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_price_change_errand"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_methods_profile"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_saved_addresses_profile"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_errand"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_user"`);
    await queryRunner.query(`DROP TABLE "price_change_requests"`);
    await queryRunner.query(`DROP TYPE "public"."price_change_status_enum"`);
    await queryRunner.query(`DROP TABLE "payment_methods"`);
    await queryRunner.query(`DROP TABLE "saved_addresses"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`ALTER TABLE "evidence" DROP COLUMN "url"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method_type_enum"`);
  }
}