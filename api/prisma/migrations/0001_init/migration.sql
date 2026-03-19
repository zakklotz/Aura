-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BusinessOnboardingState" AS ENUM ('NEEDS_BUSINESS_PROFILE', 'NEEDS_PHONE_NUMBER', 'NEEDS_GREETING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "PhoneNumberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContactImportSource" AS ENUM ('CSV', 'PHONEBOOK');

-- CreateEnum
CREATE TYPE "ContactImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ThreadItemType" AS ENUM ('SMS_INBOUND', 'SMS_OUTBOUND', 'MISSED_CALL', 'VOICEMAIL', 'CALL_COMPLETED', 'CALL_DECLINED', 'SYSTEM_NOTE');

-- CreateEnum
CREATE TYPE "UnreadState" AS ENUM ('UNREAD', 'READ', 'HEARD');

-- CreateEnum
CREATE TYPE "PayloadRefType" AS ENUM ('MESSAGE', 'CALL_EVENT', 'VOICEMAIL', 'SYSTEM_NOTE');

-- CreateEnum
CREATE TYPE "ThreadParticipantKind" AS ENUM ('BUSINESS_NUMBER', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallEventType" AS ENUM ('MISSED_CALL', 'CALL_COMPLETED', 'CALL_DECLINED');

-- CreateEnum
CREATE TYPE "VoicemailTranscriptionStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GreetingMode" AS ENUM ('TTS', 'RECORDED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "VoiceRegistrationState" AS ENUM ('READY', 'DEGRADED', 'REGISTERING');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('TWILIO');

-- CreateEnum
CREATE TYPE "ProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NormalizedErrorCode" AS ENUM ('VOICE_TOKEN_ERROR', 'VOICE_REGISTRATION_ERROR', 'CALL_CONNECT_ERROR', 'SMS_SEND_ERROR', 'RECORDING_ERROR', 'TRANSCRIPTION_ERROR');

-- CreateEnum
CREATE TYPE "IdempotencyOperation" AS ENUM ('SEND_SMS', 'MARK_VOICEMAIL_HEARD', 'ACTIVATE_GREETING', 'CONTACT_IMPORT');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'CSV', 'PHONEBOOK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "display_name" TEXT,
    "onboarding_state" "BusinessOnboardingState" NOT NULL DEFAULT 'NEEDS_BUSINESS_PROFILE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_memberships" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "active_business_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "label" TEXT,
    "twilio_sid" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "voice_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "PhoneNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "notes" TEXT,
    "is_manually_edited" BOOLEAN NOT NULL DEFAULT true,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_phone_numbers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "manually_edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_import_jobs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "source" "ContactImportSource" NOT NULL,
    "status" "ContactImportStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "merged_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "contact_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "external_participant_e164" TEXT NOT NULL,
    "contact_id" TEXT,
    "last_occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_thread_item_id" TEXT,
    "last_preview" TEXT,
    "unread_sms_count" INTEGER NOT NULL DEFAULT 0,
    "unread_missed_call_count" INTEGER NOT NULL DEFAULT 0,
    "unheard_voicemail_count" INTEGER NOT NULL DEFAULT 0,
    "total_unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_participants" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "kind" "ThreadParticipantKind" NOT NULL,
    "phone_number_id" TEXT,
    "external_participant_e164" TEXT,
    "contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_items" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "item_type" "ThreadItemType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "unread_state" "UnreadState" NOT NULL DEFAULT 'UNREAD',
    "payload_ref_type" "PayloadRefType" NOT NULL,
    "payload_ref_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "preview_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thread_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "external_participant_e164" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "message_sid" TEXT,
    "body" TEXT NOT NULL,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" "NormalizedErrorCode",
    "provider_status" TEXT,
    "client_temp_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "external_participant_e164" TEXT NOT NULL,
    "event_type" "CallEventType" NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "call_sid" TEXT NOT NULL,
    "parent_call_sid" TEXT,
    "child_call_sid" TEXT,
    "provider_status" TEXT,
    "started_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "error_code" "NormalizedErrorCode",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voicemails" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "external_participant_e164" TEXT NOT NULL,
    "call_sid" TEXT NOT NULL,
    "recording_sid" TEXT,
    "recording_url" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "transcript_status" "VoicemailTranscriptionStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "transcript_text" TEXT,
    "transcription_provider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voicemails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voicemail_greetings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "mode" "GreetingMode" NOT NULL,
    "label" TEXT,
    "tts_text" TEXT,
    "audio_storage_key" TEXT,
    "audio_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voicemail_greetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registrations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "app_build" TEXT,
    "app_runtime_version" TEXT,
    "expo_push_token" TEXT,
    "voice_push_token" TEXT,
    "twilio_identity" TEXT,
    "voice_registration_state" "VoiceRegistrationState" NOT NULL DEFAULT 'REGISTERING',
    "last_registered_at" TIMESTAMP(3),
    "last_registration_error_code" "NormalizedErrorCode",
    "last_registration_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_states" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unread_sms_count" INTEGER NOT NULL DEFAULT 0,
    "unread_missed_call_count" INTEGER NOT NULL DEFAULT 0,
    "unheard_voicemail_count" INTEGER NOT NULL DEFAULT 0,
    "total_unread_count" INTEGER NOT NULL DEFAULT 0,
    "voice_registration_state" "VoiceRegistrationState" NOT NULL DEFAULT 'REGISTERING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "provider" "ProviderType" NOT NULL DEFAULT 'TWILIO',
    "event_type" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "call_sid" TEXT,
    "message_sid" TEXT,
    "recording_sid" TEXT,
    "transcription_provider_id" TEXT,
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error_code" "NormalizedErrorCode",
    "error_message" TEXT,
    "raw_payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "operation" "IdempotencyOperation" NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "businesses_onboarding_state_idx" ON "businesses"("onboarding_state");

-- CreateIndex
CREATE INDEX "business_memberships_user_id_idx" ON "business_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_memberships_business_user_key" ON "business_memberships"("business_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_preferences_active_business_id_idx" ON "user_preferences"("active_business_id");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_twilio_sid_key" ON "phone_numbers"("twilio_sid");

-- CreateIndex
CREATE INDEX "phone_numbers_business_primary_idx" ON "phone_numbers"("business_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_business_e164_key" ON "phone_numbers"("business_id", "e164");

-- CreateIndex
CREATE INDEX "contacts_business_display_name_idx" ON "contacts"("business_id", "display_name");

-- CreateIndex
CREATE INDEX "contact_phone_numbers_contact_id_idx" ON "contact_phone_numbers"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_phone_numbers_business_e164_key" ON "contact_phone_numbers"("business_id", "e164");

-- CreateIndex
CREATE INDEX "contact_import_jobs_business_created_at_idx" ON "contact_import_jobs"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "contact_import_jobs_business_idempotency_key_idx" ON "contact_import_jobs"("business_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "threads_business_last_occurred_at_idx" ON "threads"("business_id", "last_occurred_at" DESC);

-- CreateIndex
CREATE INDEX "threads_phone_number_id_idx" ON "threads"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "threads_business_number_external_key" ON "threads"("business_id", "phone_number_id", "external_participant_e164");

-- CreateIndex
CREATE INDEX "thread_participants_phone_number_id_idx" ON "thread_participants"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_participants_thread_kind_key" ON "thread_participants"("thread_id", "kind");

-- CreateIndex
CREATE INDEX "thread_items_thread_occurred_at_idx" ON "thread_items"("thread_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "thread_items_business_item_type_occurred_at_idx" ON "thread_items"("business_id", "item_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "thread_items_thread_item_type_unread_state_idx" ON "thread_items"("thread_id", "item_type", "unread_state");

-- CreateIndex
CREATE UNIQUE INDEX "thread_items_business_dedupe_key" ON "thread_items"("business_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "messages_message_sid_key" ON "messages"("message_sid");

-- CreateIndex
CREATE INDEX "messages_thread_created_at_idx" ON "messages"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "call_events_thread_created_at_idx" ON "call_events"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "call_events_call_sid_idx" ON "call_events"("call_sid");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_business_call_sid_event_type_key" ON "call_events"("business_id", "call_sid", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "voicemails_recording_sid_key" ON "voicemails"("recording_sid");

-- CreateIndex
CREATE UNIQUE INDEX "voicemails_transcription_provider_id_key" ON "voicemails"("transcription_provider_id");

-- CreateIndex
CREATE INDEX "voicemails_thread_created_at_idx" ON "voicemails"("thread_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "voicemails_transcript_status_idx" ON "voicemails"("transcript_status");

-- CreateIndex
CREATE UNIQUE INDEX "voicemails_business_call_sid_key" ON "voicemails"("business_id", "call_sid");

-- CreateIndex
CREATE INDEX "voicemail_greetings_phone_number_is_active_idx" ON "voicemail_greetings"("phone_number_id", "is_active");

-- CreateIndex
CREATE INDEX "device_registrations_voice_registration_state_idx" ON "device_registrations"("voice_registration_state");

-- CreateIndex
CREATE UNIQUE INDEX "device_registrations_business_user_device_key" ON "device_registrations"("business_id", "user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_states_business_user_key" ON "notification_states"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "provider_events_call_sid_idx" ON "provider_events"("call_sid");

-- CreateIndex
CREATE INDEX "provider_events_message_sid_idx" ON "provider_events"("message_sid");

-- CreateIndex
CREATE INDEX "provider_events_recording_sid_idx" ON "provider_events"("recording_sid");

-- CreateIndex
CREATE INDEX "provider_events_transcription_provider_id_idx" ON "provider_events"("transcription_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_provider_dedupe_key" ON "provider_events"("provider", "dedupe_key");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_business_actor_operation_key" ON "idempotency_keys"("business_id", "actor_user_id", "operation", "key");

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_phone_numbers" ADD CONSTRAINT "contact_phone_numbers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_phone_numbers" ADD CONSTRAINT "contact_phone_numbers_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_import_jobs" ADD CONSTRAINT "contact_import_jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_import_jobs" ADD CONSTRAINT "contact_import_jobs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_items" ADD CONSTRAINT "thread_items_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_items" ADD CONSTRAINT "thread_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_items" ADD CONSTRAINT "thread_items_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_items" ADD CONSTRAINT "thread_items_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voicemail_greetings" ADD CONSTRAINT "voicemail_greetings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voicemail_greetings" ADD CONSTRAINT "voicemail_greetings_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Runtime guarantee: exactly one active greeting per phone number
CREATE UNIQUE INDEX "voicemail_greetings_one_active_per_phone_number_idx"
ON "voicemail_greetings" ("phone_number_id")
WHERE "is_active" = true;

-- Mailbox cursor projection
CREATE INDEX "thread_items_mailbox_projection_idx"
ON "thread_items" ("business_id", "occurred_at" DESC, "id" DESC)
WHERE "item_type" = 'VOICEMAIL';

-- Unread recompute helpers
CREATE INDEX "thread_items_unread_sms_projection_idx"
ON "thread_items" ("thread_id", "occurred_at" DESC, "id" DESC)
WHERE "item_type" = 'SMS_INBOUND' AND "unread_state" = 'UNREAD';

CREATE INDEX "thread_items_unread_missed_call_projection_idx"
ON "thread_items" ("thread_id", "occurred_at" DESC, "id" DESC)
WHERE "item_type" = 'MISSED_CALL' AND "unread_state" = 'UNREAD';

CREATE INDEX "thread_items_unheard_voicemail_projection_idx"
ON "thread_items" ("thread_id", "occurred_at" DESC, "id" DESC)
WHERE "item_type" = 'VOICEMAIL' AND "unread_state" = 'UNREAD';
