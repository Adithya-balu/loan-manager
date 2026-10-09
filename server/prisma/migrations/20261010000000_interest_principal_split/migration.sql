-- Split collections into interest and principal (interest first per installment).
ALTER TABLE "Installment" ADD COLUMN "interestPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Installment" ADD COLUMN "principalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "principalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Installments: cash received (paid − waived) covers interest first. Waived
-- interest was never received, so it can't count as interest paid.
UPDATE "Installment" SET
  "interestPaid" = GREATEST(0, LEAST("interestComponent" - "waivedAmount", "paidAmount" - "waivedAmount")),
  "principalPaid" = GREATEST(0, "paidAmount" - "waivedAmount"
    - GREATEST(0, LEAST("interestComponent" - "waivedAmount", "paidAmount" - "waivedAmount")));

-- Payments need their history replayed to split exactly; run
-- `npm run backfill:split --workspace server` after deploying. Until then,
-- treat each payment as principal-only rather than inventing interest income.
UPDATE "Payment" SET "principalAmount" = "amount";
