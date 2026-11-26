// Account fields shared by self sign-up (/register) and accounts an admin creates on the Pengguna page.
import { z } from "zod";

export const accountFields = {
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,30}$/, "Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah"),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(200),
};

/** What a sign-up tells the admin who approves it: the institution and what it wants monitored. */
export const signupFields = {
  institution: z.string().trim().min(2, "Nama instansi minimal 2 karakter").max(120),
  topics: z.string().trim().min(3, "Tulis topik atau kata kunci yang ingin dipantau").max(500),
};

/** Roles an admin may create from the panel; new admins are still made by hand. */
export const CREATABLE_ROLES = ["user", "viewer"] as const;

/** YYYY-MM-DD, the last day of access (end of that day, Jakarta). */
export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const endOfDay = (date: string) => new Date(`${date}T23:59:59+07:00`);

/**
 * An account made by an admin: a client ("user", plan Instansi, with the last day of its subscription; null = no end)
 * or a viewer (sees everything read-only, no subscription).
 */
export const newAccountSchema = z.object({
  ...accountFields,
  role: z.enum(CREATABLE_ROLES),
  institution: z.string().trim().max(120).nullable().default(null),
  expiresAt: dateField.nullable().default(null),
}).transform((a) => (a.role === "user" ? a : { ...a, institution: null, expiresAt: null }));

export type NewAccount = z.infer<typeof newAccountSchema>;
