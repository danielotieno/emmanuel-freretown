import type { StaffChangeRefusal, StaffInputError } from "@/modules/access";

/** After a change on a staff member's page: what happened, by the code in the URL. */
export const DONE_MESSAGES: Record<string, string> = {
  granted: "Role granted. It applies from their next page.",
  revoked: "Role revoked. It no longer applies, from their next page.",
  second_factor:
    "Authenticator app removed and signed out everywhere. At their next sign-in, with their password, they set up an app again.",
  sessions: "Signed out everywhere.",
};

/** Why a change was refused, by the code in the URL. */
export const REFUSAL_MESSAGES: Record<StaffChangeRefusal, string> = {
  not_found: "This staff account no longer exists.",
  unchanged: "Nothing changed.",
  self: "You can't do that to your own account. Ask the other Super Administrator.",
  last_super_admin:
    "This is the only active Super Administrator. Grant the role to someone else first.",
};

export const INPUT_ERRORS: Record<"name" | "email" | "roles", Record<StaffInputError, string>> = {
  name: {
    required: "Enter their full name.",
    invalid: "Remove the unusual characters from the name.",
    too_long: "The name must be 200 characters or fewer.",
  },
  email: {
    required: "Enter their email address.",
    invalid: "Enter an email address like name@example.com.",
    too_long: "The email address is too long.",
  },
  roles: {
    required: "Choose at least one role.",
    invalid: "Choose at least one role.",
    too_long: "Choose at least one role.",
  },
};
