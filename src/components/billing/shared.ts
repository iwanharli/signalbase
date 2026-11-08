// Client-side invoice shape and small display helpers shared by the billing pages.
export type InvoiceRow = {
  id: string; number: string; accountId: string; plan: string; billing: "monthly" | "yearly";
  subtotal: number; tax: number; total: number; periodStart: string; periodEnd: string;
  status: "unpaid" | "paid" | "cancelled"; dueAt: string; paidAt: string | null; note: string | null; createdAt: string;
  account?: { name: string; username: string };
};

export const STATUS: Record<InvoiceRow["status"], [tone: "warning" | "success" | "neutral", label: string]> = {
  unpaid: ["warning", "Belum dibayar"], paid: ["success", "Lunas"], cancelled: ["neutral", "Dibatalkan"],
};

export const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
export const tanggal = (d: string | Date) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
