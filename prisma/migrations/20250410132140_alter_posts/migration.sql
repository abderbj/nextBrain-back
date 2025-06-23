/*
  Warnings:

  - You are about to drop the column `title` on the `forum_posts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "forum_posts" DROP COLUMN "title";
ALTER TABLE "forum_posts" ALTER COLUMN "content" DROP NOT NULL;
