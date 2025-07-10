-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('GEMINI', 'LLAMA');

-- AlterTable
ALTER TABLE "chatbot_conversations" ADD COLUMN     "model_type" "ModelType" NOT NULL DEFAULT 'GEMINI';

-- CreateIndex
CREATE INDEX "chatbot_conversations_model_type_idx" ON "chatbot_conversations"("model_type");
