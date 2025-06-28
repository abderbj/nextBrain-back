/*
  Warnings:

  - You are about to drop the `daily_tips` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `farms` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `follows` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `forum_posts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `land_divisions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plant_health_diagnostics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plant_health_scans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `post_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `post_likes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_types` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_usages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shared_posts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_assignments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tasks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workers` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updated_at` to the `chatbot_conversations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "farms" DROP CONSTRAINT "farms_user_id_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_followed_id_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_follower_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_posts" DROP CONSTRAINT "forum_posts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "land_divisions" DROP CONSTRAINT "land_divisions_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "land_divisions" DROP CONSTRAINT "land_divisions_plant_id_fkey";

-- DropForeignKey
ALTER TABLE "plant_health_diagnostics" DROP CONSTRAINT "plant_health_diagnostics_scan_id_fkey";

-- DropForeignKey
ALTER TABLE "plant_health_scans" DROP CONSTRAINT "plant_health_scans_user_id_fkey";

-- DropForeignKey
ALTER TABLE "plants" DROP CONSTRAINT "plants_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "post_comments" DROP CONSTRAINT "post_comments_post_id_fkey";

-- DropForeignKey
ALTER TABLE "post_comments" DROP CONSTRAINT "post_comments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "post_likes" DROP CONSTRAINT "post_likes_post_id_fkey";

-- DropForeignKey
ALTER TABLE "post_likes" DROP CONSTRAINT "post_likes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_usages" DROP CONSTRAINT "resource_usages_land_division_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_usages" DROP CONSTRAINT "resource_usages_resource_type_id_fkey";

-- DropForeignKey
ALTER TABLE "shared_posts" DROP CONSTRAINT "shared_posts_post_id_fkey";

-- DropForeignKey
ALTER TABLE "shared_posts" DROP CONSTRAINT "shared_posts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "task_assignments" DROP CONSTRAINT "task_assignments_task_id_fkey";

-- DropForeignKey
ALTER TABLE "task_assignments" DROP CONSTRAINT "task_assignments_worker_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_land_division_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workers" DROP CONSTRAINT "workers_employerId_fkey";

-- AlterTable
ALTER TABLE "chatbot_conversations" ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'New Chat',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "daily_tips";

-- DropTable
DROP TABLE "farms";

-- DropTable
DROP TABLE "follows";

-- DropTable
DROP TABLE "forum_posts";

-- DropTable
DROP TABLE "land_divisions";

-- DropTable
DROP TABLE "plant_health_diagnostics";

-- DropTable
DROP TABLE "plant_health_scans";

-- DropTable
DROP TABLE "plants";

-- DropTable
DROP TABLE "post_comments";

-- DropTable
DROP TABLE "post_likes";

-- DropTable
DROP TABLE "resource_types";

-- DropTable
DROP TABLE "resource_usages";

-- DropTable
DROP TABLE "shared_posts";

-- DropTable
DROP TABLE "task_assignments";

-- DropTable
DROP TABLE "tasks";

-- DropTable
DROP TABLE "workers";

-- DropEnum
DROP TYPE "AreaUnit";

-- DropEnum
DROP TYPE "CultivationStatus";

-- DropEnum
DROP TYPE "EmploymentStatus";

-- DropEnum
DROP TYPE "FollowStatus";

-- DropEnum
DROP TYPE "InvitationStatus";

-- DropEnum
DROP TYPE "PostCategory";

-- DropEnum
DROP TYPE "TaskPriority";

-- DropEnum
DROP TYPE "TaskStatus";
