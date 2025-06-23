/*
  Warnings:

  - Added the required column `farm_id` to the `plants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "plants" ADD COLUMN     "farm_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "plants" ADD CONSTRAINT "plants_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
