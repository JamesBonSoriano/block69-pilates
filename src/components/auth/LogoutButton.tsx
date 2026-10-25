// A "Log out" button.
// Where it's used: the top card of My Profile, beside the name (Version 1.4
// took it out of the client header and phone menu) and the admin frame.
//
// It's a tiny form whose action is the logOut Server Action
// (src/lib/auth/actions.ts), so it works even before the page's JavaScript
// has loaded, and the logging out happens on the server.

import { Button, type ButtonVariant } from "@/components/ui/Button";
import { adminLogOut, logOut } from "@/lib/auth/actions";

type LogoutButtonProps = {
  variant?: ButtonVariant; // look of the button (default: secondary outline)
  fullWidth?: boolean;
  className?: string; // extra classes for the button
  formClassName?: string; // extra classes for the form around it
  admin?: boolean; // true in the admin frame: go to /admin/login afterwards
};

// The log out button.
// Takes: optional look settings.
// Gives back: a <form> with one submit button. After logging out, the
// server sends clients to the Home page and admins to /admin/login.
export function LogoutButton({
  variant = "secondary",
  fullWidth = false,
  className,
  formClassName,
  admin = false,
}: LogoutButtonProps) {
  return (
    <form action={admin ? adminLogOut : logOut} className={formClassName}>
      <Button type="submit" variant={variant} fullWidth={fullWidth} className={className}>
        Log out
      </Button>
    </form>
  );
}
