import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner decision Q-NAME: display name for customers and runners. */
export class AddUserDisplayName1790100000000 implements MigrationInterface {
  name = 'AddUserDisplayName1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "displayName" character varying(80)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "displayName"`);
  }
}
