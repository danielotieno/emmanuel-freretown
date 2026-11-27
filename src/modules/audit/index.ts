/**
 * audit: the append-only audit log and retention redaction (BR-12, BR-14, FR-11).
 * Public API of this module. Other code imports only from here, usually as a namespace:
 *
 *   import * as audit from "../audit";
 *   await audit.write(tx, { … });
 */
export {
  recordAccess,
  write,
  writeMany,
  type AccessEvent,
  type Actor,
  type AuditEntityType,
  type AuditEntry,
  type StaffActor,
} from "./write";
export { changes, type AuditValue, type AuditValues } from "./values";
export {
  LOG_PAGE,
  readLog,
  readTrail,
  TRAIL_LIMIT,
  type AuditRecord,
  type TrailEntityType,
} from "./read";
export { redactExpiredRegistrations, type RedactionResult } from "./retention";
