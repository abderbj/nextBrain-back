/*
  Warnings:

  - You are about to drop the column `suggested_actions` on the `plant_health_diagnostics` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `plant_health_scans` table. All the data in the column will be lost.
  - You are about to drop the column `plant_type` on the `plant_health_scans` table. All the data in the column will be lost.
  - Added the required column `prevention` to the `plant_health_diagnostics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `treatment` to the `plant_health_diagnostics` table without a default value. This is not possible if the table is not empty.
  - Made the column `disease_name` on table `plant_health_diagnostics` required. This step will fail if there are existing NULL values in that column.
  - Made the column `confidence_score` on table `plant_health_diagnostics` required. This step will fail if there are existing NULL values in that column.
  - Made the column `description` on table `plant_health_diagnostics` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "plant_health_diagnostics" DROP COLUMN "suggested_actions",
ADD COLUMN     "prevention" TEXT NOT NULL,
ADD COLUMN     "treatment" TEXT NOT NULL,
ALTER COLUMN "disease_name" SET NOT NULL,
ALTER COLUMN "confidence_score" SET NOT NULL,
ALTER COLUMN "description" SET NOT NULL;

-- AlterTable
ALTER TABLE "plant_health_scans" DROP COLUMN "notes",
DROP COLUMN "plant_type";
