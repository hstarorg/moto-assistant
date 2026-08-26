import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchiveAndFuelSoftDelete1787630400000 implements MigrationInterface {
  name = 'AddArchiveAndFuelSoftDelete1787630400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moto_assistant"."fuel_records"
      ADD "deleted_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      DROP INDEX "moto_assistant"."idx_fuel_records_moto_date_id"
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_fuel_records_moto_active_date_id"
      ON "moto_assistant"."fuel_records" ("moto_id", "refuel_date", "id")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "moto_assistant"."idx_fuel_records_moto_active_date_id"
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_fuel_records_moto_date_id"
      ON "moto_assistant"."fuel_records" ("moto_id", "refuel_date", "id")
    `);
    await queryRunner.query(`
      ALTER TABLE "moto_assistant"."fuel_records"
      DROP COLUMN "deleted_at"
    `);
  }
}
