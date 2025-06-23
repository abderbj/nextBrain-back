-- CreateEnum
CREATE TYPE "Invitation" AS ENUM ('REFUSED', 'ACCEPTED', 'PENDING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invitation" "Invitation" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';
