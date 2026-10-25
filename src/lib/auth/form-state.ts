// The shape of the answer our login / sign-up / password actions send back
// to their form after it's submitted.
// Where it's used: src/lib/auth/actions.ts (makes it) and the form components
// in src/app/(auth)/ (show it).
// (It lives in its own file because a "use server" file may only export
// functions, not types or plain values.)

export type AuthFormState = {
  // A message for the whole form, shown at the top in red
  error?: string;
  // Messages for single fields, e.g. { mobile: "Please enter a valid ..." }
  fieldErrors?: Partial<Record<string, string>>;
  // What the person typed (never passwords), so the form can fill it back in
  // after an error instead of making them type it all again
  values?: Partial<Record<string, string>>;
  // A success message (e.g. "Check your email"); the form shows it instead of the fields
  success?: string;
};

// The starting state of every form: nothing to show yet.
export const emptyFormState: AuthFormState = {};
