// The active project: picked in the top bar, kept in a cookie, and named in the path of project pages:
// /projects/<id> (Beranda), /projects/<id>/media/social, /projects/<id>/issues/media-online, … The same pages without the prefix
// show the whole bank (staff only). Not a secret (only a project id), so the client can write the cookie; access is
// still checked per request.
export const PROJECT_COOKIE = "sb_project";

/** Data pages that show either the whole bank (this path) or one project (/projects/<id> + this path). */
const PROJECT_PAGES = ["/dashboard", "/media/social", "/media/online", "/issues/media-online", "/issues/media-social", "/analysis/sna", "/analysis/ontology", "/analysis/media", "/command-center"];
export const isProjectPage = (page: string) => PROJECT_PAGES.includes(page);

/** "/projects/<id>/issues/media-online" → { id, page: "/issues/media-online" }; "/projects/<id>" → page "/dashboard"; other paths → id null. */
export function splitProjectPath(path: string): { id: string | null; page: string } {
  const m = path.match(/^\/projects\/([^/]+)(\/.*)?$/);
  if (!m || m[1] === "new") return { id: null, page: path };
  return { id: decodeURIComponent(m[1]), page: m[2] && m[2] !== "/" ? m[2] : "/dashboard" };
}

/** The path of a data page for one project, or for the whole bank when id is null. */
export function projectPath(id: string | null, page: string) {
  if (!id) return page;
  const base = `/projects/${encodeURIComponent(id)}`;
  return page === "/dashboard" ? base : `${base}${page}`;
}

/** Project settings pages. */
export const projectSettingsPath = (id: string, part: "" | "ai" | "labels" = "") => `/projects/${encodeURIComponent(id)}/settings${part ? `/${part}` : ""}`;

/** Path segments renamed to English on 27 Nov 2026. */
const OLD_SEGMENTS: Record<string, string> = {
  proyek: "projects", pengaturan: "settings", analisis: "analysis", ontologi: "ontology", "laporan-eksekutif": "reports", laporan: "report",
  notifikasi: "notifications", fitur: "features", integrasi: "integration", solusi: "solutions", kontak: "contact", syarat: "terms", privasi: "privacy",
};

/** A path from before 27 Nov 2026 in today's English names (unchanged when it already is one). */
function renamedPath(path: string) {
  const segments = path.split("/");
  const out = segments.map((s, i) => {
    const before = segments[i - 1];
    if (s === "baru" && before === "proyek") return "new";
    if (s === "label" && before === "pengaturan") return "labels";
    return OLD_SEGMENTS[s] ?? s;
  }).join("/");
  // Issues: /isu (news), /isu/ews and /isu/sosial (social), /isu/online.
  return out.replace(/(^|\/)isu(\/(?:online|ews|sosial))?$/, (_, start: string, sub?: string) =>
    `${start}issues/${sub === "/ews" || sub === "/sosial" ? "media-social" : "media-online"}`);
}

/** Where an address from before 27 Nov 2026 now lives (Indonesian paths, the project as ?key=<id>, settings under
 *  /project/<id>), or null when it is current. Keeps old links and bookmarks working. */
export function legacyProjectUrl(path: string, params: URLSearchParams): string | null {
  const settings = path.match(/^\/project(?:\/([^/]+))?(\/ai|\/labels)?\/?$/);
  if (settings) {
    const [, id, part] = settings;
    if (!id) return "/projects";
    if (id === "new") return "/projects/new";
    return projectSettingsPath(id, part === "/ai" ? "ai" : part === "/labels" ? "labels" : "");
  }
  const page = renamedPath(path);
  const id = isProjectPage(page) ? params.get("key") || params.get("project") : null;
  if (page === path && !id) return null;
  const rest = new URLSearchParams(params);
  if (id) { rest.delete("key"); rest.delete("project"); }
  const target = projectPath(id, page);
  return rest.size ? `${target}?${rest}` : target;
}

/** Client only. null clears it: staff then see the whole bank. */
export function saveActiveProject(id: string | null) {
  document.cookie = id
    ? `${PROJECT_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
    : `${PROJECT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function readActiveProject(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${PROJECT_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(PROJECT_COOKIE.length + 1)) || null : null;
}
