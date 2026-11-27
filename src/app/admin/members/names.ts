import type { MemberStatus } from "@/modules/membership";

/** Member statuses in words, on staff screens (requirements §6). */
export const STATUS_NAMES: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DECEASED: "Deceased",
  TRANSFERRED_OUT: "Transferred out",
};

/** The SMS language (D44). */
export const LANGUAGE_NAMES = { en: "English", sw: "Kiswahili" } as const;

/** In place of a name that D45's removal took, one year after the record closed. */
export const REMOVED_NAME = "Name removed (D45)";
