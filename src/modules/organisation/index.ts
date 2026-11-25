/**
 * organisation: HBCs and departments (domain-model.md §1).
 * Public API of this module. Other code imports only from here.
 */
export {
  checkUnitsForRegistration,
  listActiveDepartments,
  listActiveHbcs,
  type Unit,
  type UnitCheck,
} from "./units";
