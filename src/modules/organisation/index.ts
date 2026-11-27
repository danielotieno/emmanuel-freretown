/**
 * organisation: HBCs and departments (domain-model.md §1).
 * Public API of this module. Other code imports only from here.
 */
export {
  checkUnitsForRegistration,
  listActiveDepartments,
  listActiveHbcs,
  unitNames,
  type Unit,
  type UnitCheck,
} from "./units";
export {
  addUnit,
  listUnits,
  moveUnit,
  renameUnit,
  setUnitActive,
  UNIT_KINDS,
  unitKey,
  type UnitChangeRefusal,
  type UnitChangeResult,
  type UnitKind,
  type UnitNameError,
  type UnitRow,
} from "./admin";
