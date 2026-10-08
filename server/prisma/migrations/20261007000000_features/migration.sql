-- AlterTable: Customer new fields
ALTER TABLE "Customer" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Customer" ADD COLUMN "aadhaar" TEXT;
ALTER TABLE "Customer" ADD COLUMN "location" TEXT;

-- AlterTable: Loan disbursement mode + guarantor fields
ALTER TABLE "Loan" ADD COLUMN "disbursementMode" "PaymentMode" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Loan" ADD COLUMN "guarantorName" TEXT;
ALTER TABLE "Loan" ADD COLUMN "guarantorMobile" TEXT;
ALTER TABLE "Loan" ADD COLUMN "guarantorRelation" TEXT;
ALTER TABLE "Loan" ADD COLUMN "guarantorAddress" TEXT;

-- CreateTable: LoanDocument
CREATE TABLE "LoanDocument" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanyProfile (singleton)
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoanDocument" ADD CONSTRAINT "LoanDocument_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
