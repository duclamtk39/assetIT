-- AlterTable
ALTER TABLE "network_samples" DROP COLUMN "avgResponseMs",
ADD COLUMN     "sumResponseMs" INTEGER NOT NULL DEFAULT 0;

