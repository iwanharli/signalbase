// Server side of the data pages that exist for the whole bank (/issues/media-online) and per project (/projects/<id>/issues/media-online).
import { notFound, redirect } from "next/navigation";
import { NoProjectYet } from "@/components/media/NoProjectYet";
import { projectPath } from "@/lib/activeProject";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import type { MediaType } from "@/lib/media/types";
import { roleOf } from "@/lib/session";
import { getSession, keyAccess, visibleKeys } from "./auth";
import { prisma } from "./db";

type Query = Record<string, string | string[] | undefined>;

/** The query string of a page's search params, to carry over on a redirect ("" or "?a=b"). */
export function queryString(query: Query) {
  const p = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
  return p.size ? `?${p}` : "";
}

/** Whole-bank pages are for staff. A client is sent to the same page of its first project that reads `type` (any project
 *  when null); with none it gets `empty`, or by default a note on how to get a project. Staff: null (render the page). */
export async function clientToProject(page: string, query: Query, type: MediaType | null, label?: string, empty?: React.ReactNode) {
  const session = await getSession();
  if (!session || roleOf(session) !== "user") return null;
  const projects = await prisma.project.findMany({
    where: { ...visibleKeys(session.sub), revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, scope: true, keywords: true },
  });
  const project = type ? projects.find((p) => allowsType(parseKeyScope(p.scope, p.keywords), type)) : projects[0];
  if (project) redirect(`${projectPath(project.id, page)}${queryString(query)}`);
  return empty ?? <NoProjectYet type={type ?? "social"} label={label} hasKeys={projects.length > 0} />;
}

/** /projects/<id>/…: the project must exist and be visible to the account; otherwise the page does not exist for it. */
export async function requireProject(id: string) {
  const session = await getSession();
  if (!session) redirect("/login");
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
  if (!project || !(await keyAccess({ id: session.sub, username: session.username, role: roleOf(session) }, id))) notFound();
}
