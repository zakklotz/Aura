-- CreateEnum
CREATE TYPE "CallSessionState" AS ENUM (
    'INCOMING',
    'ANSWERING',
    'OUTGOING_DIALING',
    'CONNECTING',
    'ACTIVE',
    'ENDED',
    'FAILED'
);

-- CreateEnum
CREATE TYPE "CallSessionSource" AS ENUM ('API', 'SDK', 'WEBHOOK');

-- CreateTable
CREATE TABLE "call_sessions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "call_sid" TEXT,
    "parent_call_sid" TEXT,
    "child_call_sid" TEXT,
    "direction" "CallDirection",
    "state" "CallSessionState" NOT NULL,
    "source" "CallSessionSource" NOT NULL,
    "external_participant_e164" TEXT,
    "last_actor_user_id" TEXT,
    "last_actor_device_id" TEXT,
    "last_transition_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "retain_until" TIMESTAMP(3),
    "error_code" "NormalizedErrorCode",
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_sessions_call_sid_key" ON "call_sessions"("call_sid");

-- CreateIndex
CREATE INDEX "call_sessions_business_updated_at_idx" ON "call_sessions"("business_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "call_sessions_business_state_updated_at_idx" ON "call_sessions"("business_id", "state", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "call_sessions_actor_device_updated_at_idx" ON "call_sessions"("last_actor_device_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "call_sessions_retain_until_idx" ON "call_sessions"("retain_until");

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_phone_number_id_fkey"
FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
