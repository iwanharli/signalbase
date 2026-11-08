"use client";
// The signed-in account's role, for client components that show admin-only options.
import { createContext, useContext } from "react";
import type { Role } from "@/lib/session";

const RoleContext = createContext<Role>("admin");
export const RoleProvider = RoleContext.Provider;
export const useRole = () => useContext(RoleContext);
