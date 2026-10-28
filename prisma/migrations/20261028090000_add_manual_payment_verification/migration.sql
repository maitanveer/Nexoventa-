-- Add configurable course fees and private manual-payment review records.
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'SADAPAY');

ALTER TABLE "Course" ADD COLUMN "fee" DECIMAL(10,2);

UPDATE "Course" SET "fee" = 18000 WHERE "slug" = 'medical-billing';

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "method" "PaymentMethod",
    "expectedAmount" DECIMAL(10,2),
    "amount" DECIMAL(10,2),
    "transactionReference" TEXT,
    "normalizedTransactionReference" TEXT,
    "paymentDate" TIMESTAMP(3),
    "receiptPath" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "studentTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Payment" ("id", "applicationId", "status", "expectedAmount", "createdAt", "updatedAt")
SELECT 'legacy-payment-' || application."id", application."id", 'NOT_SUBMITTED', course."fee", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Application" AS application
JOIN "Batch" AS batch ON batch."id" = application."batchId"
JOIN "Course" AS course ON course."id" = batch."courseId";

CREATE UNIQUE INDEX "Payment_applicationId_key" ON "Payment"("applicationId");
CREATE UNIQUE INDEX "Payment_studentTokenHash_key" ON "Payment"("studentTokenHash");
CREATE UNIQUE INDEX "Payment_method_normalizedTransactionReference_key" ON "Payment"("method", "normalizedTransactionReference");
CREATE INDEX "Payment_status_submittedAt_idx" ON "Payment"("status", "submittedAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;