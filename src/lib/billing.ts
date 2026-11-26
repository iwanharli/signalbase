// Manual billing (admins only): Instansi invoice amounts from the agreed monthly price, tax, and the bank account shown
// on invoices. The yearly discount follows src/components/pricing/plans.ts.
import { yearlyPrice } from "@/components/pricing/plans";
import type { PlanId } from "./plans";

export type Billing = "monthly" | "yearly";
export const BILLINGS: Billing[] = ["monthly", "yearly"];
export const BILLING_LABEL: Record<Billing, string> = { monthly: "Bulanan", yearly: "Tahunan" };

/** Effective VAT on services: 12% × DPP 11/12 = 11% of the price. Change here if the rule changes. */
export const TAX_RATE = 0.11;
export const TAX_LABEL = "PPN 11%";

/** Days to pay after the invoice is created. */
export const DUE_DAYS = 7;

/** Price before tax for an Instansi subscription: the monthly price an admin agreed with the client, for a month or a year. */
export function invoiceAmounts(_plan: PlanId, billing: Billing, customMonthly?: number | null) {
  const monthly = customMonthly ?? 0;
  const subtotal = billing === "yearly" ? yearlyPrice(monthly) : monthly;
  const tax = Math.round(subtotal * TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

/** Bank account and issuer shown on invoices (server env; placeholders until set). */
export function billingIssuer() {
  return {
    company: process.env.BILLING_COMPANY || "Signalbase",
    address: process.env.BILLING_ADDRESS || "",
    email: process.env.BILLING_EMAIL || "",
    bank: process.env.BILLING_BANK || "",
    accountNumber: process.env.BILLING_ACCOUNT_NO || "",
    accountName: process.env.BILLING_ACCOUNT_NAME || "",
  };
}
