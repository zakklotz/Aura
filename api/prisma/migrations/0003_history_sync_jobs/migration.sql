CREATE TYPE "HistorySyncJobStatus" AS ENUM ('IDLE', 'SYNCING', 'COMPLETED', 'FAILED');

CREATE TABLE "history_sync_jobs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "status" "HistorySyncJobStatus" NOT NULL DEFAULT 'IDLE',
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_successful_sync_at" TIMESTAMP(3),
  "error_message" TEXT,
  "imported_messages" INTEGER NOT NULL DEFAULT 0,
  "imported_calls" INTEGER NOT NULL DEFAULT 0,
  "imported_voicemails" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "history_sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "history_sync_jobs_business_id_key" ON "history_sync_jobs"("business_id");
CREATE INDEX "history_sync_jobs_status_updated_at_idx" ON "history_sync_jobs"("status", "updated_at");

ALTER TABLE "history_sync_jobs"
ADD CONSTRAINT "history_sync_jobs_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
