// Manual billing: invoice amounts from the pricing table, tax, and the bank account shown on invoices.
// Prices come from src/components/pricing/plans.ts so invoices always match /pricing.
import { PLANS, yearlyPrice } from "@/components/pricing/plans";
import type { PlanId } from "./plans";

export type Billing = "monthly" | "yearly";
export const BILLINGS: Billing[] = ["monthly", "yearly"];
export const BILLING_LABEL: Record<Billing, string> = { monthly: "Bulanan", yearly: "Tahunan" };

/** Plans a user may order on their own; Instansi is quoted by an admin. */
export const SELF_SERVE_PLANS: PlanId[] = ["starter", "pro"];

/** Effective VAT on services: 12% × DPP 11/12 = 11% of the price. Change here if the rule changes. */
export const TAX_RATE = 0.11;
export const TAX_LABEL = "PPN 11%";

/** Days to pay after the invoice is created. */
export const DUE_DAYS = 7;

/** Price before tax for a plan and billing period; `customMonthly` overrides the list price (Instansi quotes). */
export function invoiceAmounts(plan: PlanId, billing: Billing, customMonthly?: number | null) {
  const monthly = customMonthly ?? PLANS.find((p) => p.id === plan)?.monthly ?? 0;
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
