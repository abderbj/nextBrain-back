/*
  Warnings:

  - You are about to drop the `saved_posts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "saved_posts" DROP CONSTRAINT "saved_posts_post_id_fkey";

-- DropForeignKey
ALTER TABLE "saved_posts" DROP CONSTRAINT "saved_posts_user_id_fkey";

-- DropTable
DROP TABLE "saved_posts";
