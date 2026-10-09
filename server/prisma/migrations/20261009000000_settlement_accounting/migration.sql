-- Settlement accounting: tag settlement payments and record waived interest.
CREATE TYPE "PaymentKind" AS ENUM ('REGULAR', 'SETTLEMENT');

ALTER TABLE "Payment" ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "Payment" ADD COLUMN "settlementInterest" DOUBLE PRECISION;
ALTER TABLE "Installment" ADD COLUMN "waivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Existing settlements were recorded with no installment and this note prefix.
UPDATE "Payment" SET "kind" = 'SETTLEMENT'
WHERE "installmentId" IS NULL AND "note" LIKE 'Settlement / foreclosure%';
