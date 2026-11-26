// The active project: picked in the top bar, kept in a cookie, and carried to project pages as ?key=.
// Not a secret (only a project id), so the client can write it; access is still checked per request.
export const PROJECT_COOKIE = "sb_project";

/** Pages that show one project's data through ?key= (no key: the whole bank, staff only). */
const PROJECT_PAGES = ["/dashboard", "/media/", "/isu", "/analisis/", "/command-center"];
export const isProjectPage = (path: string) => PROJECT_PAGES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));

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
