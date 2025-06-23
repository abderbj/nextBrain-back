/*
  Warnings:

  - You are about to drop the column `crop_type` on the `land_divisions` table. All the data in the column will be lost.
  - Made the column `plant_id` on table `land_divisions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "land_divisions" DROP COLUMN "crop_type",
ALTER COLUMN "plant_id" SET NOT NULL;
