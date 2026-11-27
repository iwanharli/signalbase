"use client";
// The project a data page is showing, from its path (/projects/<id>/…); null on the whole-bank pages.
import { usePathname } from "next/navigation";
import { splitProjectPath } from "./activeProject";

export const useProjectId = () => splitProjectPath(usePathname()).id;
