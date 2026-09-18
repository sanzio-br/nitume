import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1789769505209 implements MigrationInterface {
  name = 'InitialSchema1789769505209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    await queryRunner.query(`CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "senderId" uuid NOT NULL, "message" text NOT NULL, "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_messages_errand" ON "chat_messages" ("errandId")`);

    await queryRunner.query(`CREATE TABLE "customer_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "defaultAddressText" character varying(500), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_customer_profiles" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customer_profiles_user" ON "customer_profiles" ("userId")`);

    await queryRunner.query(`CREATE TYPE "public"."dispute_event_type_enum" AS ENUM('opened', 'comment', 'evidence_added', 'resolved')`);
    await queryRunner.query(`CREATE TABLE "dispute_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "disputeId" uuid NOT NULL, "actorId" uuid, "eventType" "public"."dispute_event_type_enum" NOT NULL, "payload" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dispute_events" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_dispute_events_dispute" ON "dispute_events" ("disputeId")`);

    await queryRunner.query(`CREATE TYPE "public"."dispute_status_enum" AS ENUM('open', 'under_review', 'resolved', 'rejected')`);
    await queryRunner.query(`CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "openedBy" uuid NOT NULL, "reason" character varying(500) NOT NULL, "status" "public"."dispute_status_enum" NOT NULL DEFAULT 'open', "resolution" text, "resolvedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_disputes" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_disputes_errand" ON "disputes" ("errandId")`);

    await queryRunner.query(`CREATE TYPE "public"."errand_assignment_status_enum" AS ENUM('offered', 'accepted', 'declined', 'expired', 'assigned')`);
    await queryRunner.query(`CREATE TABLE "errand_assignments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "runnerProfileId" uuid NOT NULL, "status" "public"."errand_assignment_status_enum" NOT NULL DEFAULT 'offered', "offerExpiresAt" TIMESTAMP WITH TIME ZONE, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_errand_assignments" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_assignments_errand" ON "errand_assignments" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_assignments_runner" ON "errand_assignments" ("runnerProfileId")`);

    await queryRunner.query(`CREATE TABLE "errand_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "name" character varying(255) NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "unit" character varying(32), "notes" text, CONSTRAINT "PK_errand_items" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_items_errand" ON "errand_items" ("errandId")`);

    await queryRunner.query(`CREATE TYPE "public"."errand_point_type_enum" AS ENUM('pickup', 'dropoff', 'task_site')`);
    await queryRunner.query(`CREATE TABLE "errand_locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "pointType" "public"."errand_point_type_enum" NOT NULL, "coordinates" geography(Point,4326) NOT NULL, "addressText" character varying(500) NOT NULL, "placeId" character varying(255), CONSTRAINT "PK_errand_locations" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_locations_errand" ON "errand_locations" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_locations_coords" ON "errand_locations" USING gist ("coordinates")`);

    await queryRunner.query(`CREATE TYPE "public"."errand_status_enum" AS ENUM('DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED', 'PAYMENT_CONFIRMED', 'RUNNER_ASSIGNED', 'RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'COMPLETED', 'CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED', 'DISPUTED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TYPE "public"."status_history_actor_enum" AS ENUM('customer', 'runner', 'admin', 'system')`);
    await queryRunner.query(`CREATE TABLE "errand_status_history" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "fromStatus" "public"."errand_status_enum", "toStatus" "public"."errand_status_enum" NOT NULL, "actorType" "public"."status_history_actor_enum" NOT NULL, "actorId" uuid, "note" character varying(500), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_errand_status_history" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_status_history_errand" ON "errand_status_history" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_errand_status_history_timeline" ON "errand_status_history" ("errandId", "createdAt")`);

    await queryRunner.query(`CREATE TYPE "public"."errand_category_enum" AS ENUM('buy_for_me', 'pickup_delivery', 'inspection', 'representation', 'queue_admin', 'business')`);
    await queryRunner.query(`CREATE TYPE "public"."errand_urgency_enum" AS ENUM('standard', 'urgent', 'scheduled')`);
    await queryRunner.query(`CREATE TABLE "errands" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customerId" uuid NOT NULL, "category" "public"."errand_category_enum" NOT NULL, "description" text NOT NULL, "status" "public"."errand_status_enum" NOT NULL DEFAULT 'DRAFT', "budget" numeric(12,2) NOT NULL DEFAULT '0', "quotedPrice" numeric(12,2), "finalPrice" numeric(12,2), "deadlineAt" TIMESTAMP WITH TIME ZONE, "urgency" "public"."errand_urgency_enum" NOT NULL DEFAULT 'standard', "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_errands" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_errands_customer" ON "errands" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_errands_created" ON "errands" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_errands_status_category_created" ON "errands" ("status", "category", "createdAt")`);

    await queryRunner.query(`CREATE TABLE "quotes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "baseFee" numeric(12,2) NOT NULL, "distanceFee" numeric(12,2) NOT NULL DEFAULT '0', "timeFee" numeric(12,2) NOT NULL DEFAULT '0', "urgencyFee" numeric(12,2) NOT NULL DEFAULT '0', "complexityFee" numeric(12,2) NOT NULL DEFAULT '0', "premiumFee" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL, "currency" character varying(8) NOT NULL DEFAULT 'KES', "expiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_quotes" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_errand" ON "quotes" ("errandId")`);

    await queryRunner.query(`CREATE TYPE "public"."evidence_type_enum" AS ENUM('photo', 'video', 'receipt', 'document', 'signature')`);
    await queryRunner.query(`CREATE TABLE "evidence" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "type" "public"."evidence_type_enum" NOT NULL, "s3Key" character varying(255) NOT NULL, "capturedAtLocation" geography(Point,4326), "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "uploadedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_evidence" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_evidence_errand" ON "evidence" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_evidence_errand_type" ON "evidence" ("errandId", "type")`);

    await queryRunner.query(`CREATE TYPE "public"."notification_channel_enum" AS ENUM('push', 'whatsapp', 'sms', 'email', 'socket')`);
    await queryRunner.query(`CREATE TYPE "public"."notification_send_status_enum" AS ENUM('queued', 'sent', 'failed', 'dead_lettered')`);
    await queryRunner.query(`CREATE TABLE "notification_log" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid, "userId" uuid, "channel" "public"."notification_channel_enum" NOT NULL, "eventType" character varying(100) NOT NULL, "status" "public"."notification_send_status_enum" NOT NULL DEFAULT 'queued', "providerResponse" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_log" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_errand" ON "notification_log" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_user" ON "notification_log" ("userId")`);

    await queryRunner.query(`CREATE TYPE "public"."payment_transaction_status_enum" AS ENUM('initiated', 'authorized', 'completed', 'failed', 'reversed')`);
    await queryRunner.query(`CREATE TABLE "payment_transactions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "paymentId" uuid NOT NULL, "paymentTypeId" uuid NOT NULL, "mpesaReference" character varying(64), "amount" numeric(12,2) NOT NULL, "status" "public"."payment_transaction_status_enum" NOT NULL DEFAULT 'initiated', "rawCallback" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_payment_transactions" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_transactions_payment" ON "payment_transactions" ("paymentId")`);

    await queryRunner.query(`CREATE TYPE "public"."payment_type_code_enum" AS ENUM('service_fee', 'runner_fee', 'merchant_payment', 'runner_advance')`);
    await queryRunner.query(`CREATE TABLE "payment_type" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" "public"."payment_type_code_enum" NOT NULL, "name" character varying(100) NOT NULL, "description" character varying(255), CONSTRAINT "PK_payment_type" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_payment_type_code" ON "payment_type" ("code")`);

    await queryRunner.query(`CREATE TYPE "public"."payment_flow_enum" AS ENUM('merchant_direct', 'customer_to_runner', 'runner_advance', 'platform_only')`);
    await queryRunner.query(`CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'authorized', 'completed', 'failed', 'refunded')`);
    await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "serviceFee" numeric(12,2) NOT NULL, "runnerFee" numeric(12,2) NOT NULL, "merchantAmount" numeric(12,2) NOT NULL DEFAULT '0', "paymentFlow" "public"."payment_flow_enum" NOT NULL, "status" "public"."payment_status_enum" NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_payments" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_errand" ON "payments" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_status_created" ON "payments" ("status", "createdAt")`);

    await queryRunner.query(`CREATE TABLE "ratings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "raterUserId" uuid NOT NULL, "rateeUserId" uuid NOT NULL, "score" integer NOT NULL, "comment" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ratings" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_ratings_errand" ON "ratings" ("errandId")`);

    await queryRunner.query(`CREATE TYPE "public"."runner_verification_level_enum" AS ENUM('1_basic', '2_id_verified', '3_trusted', '4_professional')`);
    await queryRunner.query(`CREATE TYPE "public"."runner_availability_enum" AS ENUM('online', 'offline', 'busy')`);
    await queryRunner.query(`CREATE TABLE "runner_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "verificationLevel" "public"."runner_verification_level_enum" NOT NULL DEFAULT '1_basic', "trustScore" numeric(10,4) NOT NULL DEFAULT '0', "completionRate" numeric(5,2) NOT NULL DEFAULT '0', "onTimeRate" numeric(5,2) NOT NULL DEFAULT '0', "cancellationRate" numeric(5,2) NOT NULL DEFAULT '0', "avgRating" numeric(3,2) NOT NULL DEFAULT '0', "errandsCompleted" integer NOT NULL DEFAULT '0', "maxPurchaseAdvance" numeric(12,2) NOT NULL DEFAULT '3000', "availability" "public"."runner_availability_enum" NOT NULL DEFAULT 'offline', "currentLocation" geography(Point,4326), "lastPingAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_profiles" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_runner_profiles_user" ON "runner_profiles" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_profiles_location" ON "runner_profiles" USING gist ("currentLocation")`);

    await queryRunner.query(`CREATE TYPE "public"."runner_skill_enum" AS ENUM('shopping', 'pickup_delivery', 'inspection', 'documents', 'property_visits', 'queuing', 'business_errands')`);
    await queryRunner.query(`CREATE TABLE "runner_skills" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "runnerProfileId" uuid NOT NULL, "skill" "public"."runner_skill_enum" NOT NULL, "verified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_skills" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_skills_profile" ON "runner_skills" ("runnerProfileId")`);

    await queryRunner.query(`CREATE TABLE "runner_service_areas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "runnerProfileId" uuid NOT NULL, "area" character varying(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_service_areas" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_service_areas_profile" ON "runner_service_areas" ("runnerProfileId")`);

    await queryRunner.query(`CREATE TABLE "runner_trust_scores" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "runnerProfileId" uuid NOT NULL, "score" numeric(10,4) NOT NULL, "reason" character varying(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_trust_scores" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_trust_scores_profile" ON "runner_trust_scores" ("runnerProfileId")`);

    await queryRunner.query(`CREATE TYPE "public"."runner_verification_type_enum" AS ENUM('phone', 'government_id', 'selfie', 'payment_identity', 'reference', 'business')`);
    await queryRunner.query(`CREATE TYPE "public"."verification_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
    await queryRunner.query(`CREATE TABLE "runner_verifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "runnerProfileId" uuid NOT NULL, "verificationType" "public"."runner_verification_type_enum" NOT NULL, "status" "public"."verification_status_enum" NOT NULL DEFAULT 'pending', "documentS3Key" character varying(255), "reviewerNote" text, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_verifications" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_verifications_profile" ON "runner_verifications" ("runnerProfileId")`);

    await queryRunner.query(`CREATE TYPE "public"."device_platform_enum" AS ENUM('ios', 'android', 'web')`);
    await queryRunner.query(`CREATE TABLE "devices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "platform" "public"."device_platform_enum" NOT NULL, "pushToken" character varying(255), "lastSeenAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_devices" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_devices_user" ON "devices" ("userId")`);

    await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('customer', 'runner', 'admin', 'business')`);
    await queryRunner.query(`CREATE TYPE "public"."user_status_enum" AS ENUM('active', 'suspended', 'banned')`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "phone" character varying(32) NOT NULL, "email" character varying(255), "passwordHash" character varying(255), "role" "public"."user_role_enum" NOT NULL DEFAULT 'customer', "status" "public"."user_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")`);

    await queryRunner.query(`CREATE TABLE "runner_locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "runnerProfileId" uuid NOT NULL, "errandId" uuid, "coordinates" geography(Point,4326) NOT NULL, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_runner_locations" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_locations_profile" ON "runner_locations" ("runnerProfileId")`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_locations_errand" ON "runner_locations" ("errandId")`);
    await queryRunner.query(`CREATE INDEX "IDX_runner_locations_coords" ON "runner_locations" USING gist ("coordinates")`);

    // --- Foreign keys matching the ERD (§2.1) ---
    await queryRunner.query(`ALTER TABLE "devices" ADD CONSTRAINT "FK_devices_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "customer_profiles" ADD CONSTRAINT "FK_customer_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_profiles" ADD CONSTRAINT "FK_runner_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_verifications" ADD CONSTRAINT "FK_runner_verifications_profile" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_skills" ADD CONSTRAINT "FK_runner_skills_profile" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_service_areas" ADD CONSTRAINT "FK_runner_service_areas_profile" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_locations" ADD CONSTRAINT "FK_runner_locations_profile" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_locations" ADD CONSTRAINT "FK_runner_locations_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "runner_trust_scores" ADD CONSTRAINT "FK_runner_trust_scores_profile" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errands" ADD CONSTRAINT "FK_errands_customer" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errand_locations" ADD CONSTRAINT "FK_errand_locations_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errand_items" ADD CONSTRAINT "FK_errand_items_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errand_status_history" ADD CONSTRAINT "FK_errand_status_history_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errand_assignments" ADD CONSTRAINT "FK_errand_assignments_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "errand_assignments" ADD CONSTRAINT "FK_errand_assignments_runner" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD CONSTRAINT "FK_quotes_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_payment" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_type" FOREIGN KEY ("paymentTypeId") REFERENCES "payment_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "evidence" ADD CONSTRAINT "FK_evidence_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "evidence" ADD CONSTRAINT "FK_evidence_uploader" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_disputes_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_disputes_opener" FOREIGN KEY ("openedBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_disputes_resolver" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "dispute_events" ADD CONSTRAINT "FK_dispute_events_dispute" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "dispute_events" ADD CONSTRAINT "FK_dispute_events_actor" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_ratings_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_ratings_rater" FOREIGN KEY ("raterUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_ratings_ratee" FOREIGN KEY ("rateeUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_chat_messages_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_chat_messages_sender" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "notification_log" ADD CONSTRAINT "FK_notification_log_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "notification_log" ADD CONSTRAINT "FK_notification_log_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_errand"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ratings_errand"`);
    await queryRunner.query(`DROP TABLE "ratings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dispute_events_dispute"`);
    await queryRunner.query(`DROP TABLE "dispute_events"`);
    await queryRunner.query(`DROP TYPE "public"."dispute_event_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_disputes_errand"`);
    await queryRunner.query(`DROP TABLE "disputes"`);
    await queryRunner.query(`DROP TYPE "public"."dispute_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_evidence_errand_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_evidence_errand"`);
    await queryRunner.query(`DROP TABLE "evidence"`);
    await queryRunner.query(`DROP TYPE "public"."evidence_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_transactions_payment"`);
    await queryRunner.query(`DROP TABLE "payment_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."payment_transaction_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_errand"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payment_flow_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_type_code"`);
    await queryRunner.query(`DROP TABLE "payment_type"`);
    await queryRunner.query(`DROP TYPE "public"."payment_type_code_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_quotes_errand"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_assignments_runner"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_assignments_errand"`);
    await queryRunner.query(`DROP TABLE "errand_assignments"`);
    await queryRunner.query(`DROP TYPE "public"."errand_assignment_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_items_errand"`);
    await queryRunner.query(`DROP TABLE "errand_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_locations_coords"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_locations_errand"`);
    await queryRunner.query(`DROP TABLE "errand_locations"`);
    await queryRunner.query(`DROP TYPE "public"."errand_point_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_status_history_timeline"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errand_status_history_errand"`);
    await queryRunner.query(`DROP TABLE "errand_status_history"`);
    await queryRunner.query(`DROP TYPE "public"."status_history_actor_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errands_status_category_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errands_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_errands_customer"`);
    await queryRunner.query(`DROP TABLE "errands"`);
    await queryRunner.query(`DROP TYPE "public"."errand_urgency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."errand_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."errand_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customer_profiles_user"`);
    await queryRunner.query(`DROP TABLE "customer_profiles"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_devices_user"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TYPE "public"."device_platform_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_trust_scores_profile"`);
    await queryRunner.query(`DROP TABLE "runner_trust_scores"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_locations_coords"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_locations_errand"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_locations_profile"`);
    await queryRunner.query(`DROP TABLE "runner_locations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_service_areas_profile"`);
    await queryRunner.query(`DROP TABLE "runner_service_areas"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_skills_profile"`);
    await queryRunner.query(`DROP TABLE "runner_skills"`);
    await queryRunner.query(`DROP TYPE "public"."runner_skill_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_verifications_profile"`);
    await queryRunner.query(`DROP TABLE "runner_verifications"`);
    await queryRunner.query(`DROP TYPE "public"."verification_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."runner_verification_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_profiles_location"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_runner_profiles_user"`);
    await queryRunner.query(`DROP TABLE "runner_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."runner_availability_enum"`);
    await queryRunner.query(`DROP TYPE "public"."runner_verification_level_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_phone"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_log_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_log_errand"`);
    await queryRunner.query(`DROP TABLE "notification_log"`);
    await queryRunner.query(`DROP TYPE "public"."notification_send_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notification_channel_enum"`);
  }
}