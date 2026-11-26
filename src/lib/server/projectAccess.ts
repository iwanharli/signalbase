// Clients' access to projects (ProjectMember): admins own every project and give it to client accounts; each client
// sees the project's data (read only) and gets its own API key for it, which only admins see. A client counts as active
// while its account is active and its subscription has not ended.
import { isExpired } from "../plans";
import { prisma } from "./db";
import { hash, newKey } from "./apiKey";

type Account = { status: string; planExpiresAt: Date | null };
/** Approved, not suspended, subscription not over. */
export const clientActive = (a: Account) => a.status === "active" && !isExpired(a.planExpiresAt);

/** Shown on a project whose AI stopped because none of its clients is active any more. */
export const CLIENTS_INACTIVE = "Dijeda otomatis: semua klien proyek ini sudah tidak aktif (masa langganan berakhir). Berjalan lagi saat ada klien yang diperpanjang.";

/**
 * Why the project's AI (categorisation, AI labels, issue titles, summaries, report narratives) must not run now, or null.
 * A project with clients runs only while at least one of them is active; a project without clients follows the admin's
 * own switches.
 */
export async function aiPauseReason(apiKeyId: string): Promise<string | null> {
  const members = await prisma.projectMember.findMany({ where: { apiKeyId }, select: { account: { select: { status: true, planExpiresAt: true } } } });
  return aiPausedFor(members.map((m) => m.account)) ? CLIENTS_INACTIVE : null;
}

/** The rule: paused when the project has clients and none of them is active. */
export const aiPausedFor = (clients: Account[]) => clients.length > 0 && !clients.some(clientActive);

/** The client key fields of a fresh key (the old value, if any, stops working at once). */
function keyFields() {
  const { key, fields } = newKey();
  return { key, data: { keyPrefix: fields.prefix, keyHash: fields.hash, keyEnc: fields.keyEnc, keyCreatedAt: new Date(), keyLastUsedAt: null, keyRevokedAt: null } };
}

/** Gives the project to the client (with a new key); already given: unchanged. */
export async function grantAccess(apiKeyId: string, accountId: string, createdBy: string) {
  const existing = await prisma.projectMember.findUnique({ where: { apiKeyId_accountId: { apiKeyId, accountId } } });
  if (existing) return existing;
  return prisma.projectMember.create({ data: { apiKeyId, accountId, createdBy, ...keyFields().data } });
}

/** A new key for the client and project (the old one stops at once). Also re-enables a revoked key. */
export async function rotateAccessKey(apiKeyId: string, accountId: string) {
  const { data } = keyFields();
  return prisma.projectMember.update({ where: { apiKeyId_accountId: { apiKeyId, accountId } }, data });
}

/** Stops the client's key for the project; the client keeps seeing the project in the panel. */
export function revokeAccessKey(apiKeyId: string, accountId: string) {
  return prisma.projectMember.update({ where: { apiKeyId_accountId: { apiKeyId, accountId } }, data: { keyRevokedAt: new Date() } });
}

/** The access row of a client key value, or null. */
export function accessByKey(raw: string) {
  return prisma.projectMember.findFirst({ where: { keyHash: hash(raw) }, include: { apiKey: true, account: { select: { status: true, planExpiresAt: true, role: true } } } });
}

/** Projects whose AI is paused now (they have clients, none active): one query for the scheduled jobs' loops. */
export async function pausedProjects(): Promise<Set<string>> {
  const rows = await prisma.projectMember.findMany({ select: { apiKeyId: true, account: { select: { status: true, planExpiresAt: true } } } });
  const byProject = new Map<string, Account[]>();
  for (const r of rows) byProject.set(r.apiKeyId, [...(byProject.get(r.apiKeyId) ?? []), r.account]);
  return new Set([...byProject].filter(([, clients]) => aiPausedFor(clients)).map(([id]) => id));
}
