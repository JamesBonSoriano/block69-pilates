// A "Log out" button.
// Where it's used: the client Header (desktop and phone menu) and the admin
// frame. (Not in the My Account side menu any more, Change 17.)
//
// It's a tiny form whose action is the logOut Server Action
// (src/lib/auth/actions.ts), so it works even before the page's JavaScript
// has loaded, and the logging out happens on the server.

import { Button, type ButtonVariant } from "@/components/ui/Button";
import { logOut } from "@/lib/auth/actions";

type LogoutButtonProps = {
  variant?: ButtonVariant; // look of the button (default: secondary outline)
  fullWidth?: boolean;
  className?: string; // extra classes for the button
  formClassName?: string; // extra classes for the form around it
};

// The log out button.
// Takes: optional look settings.
// Gives back: a <form> with one submit button. After logging out, the
// server sends the person to the Home page.
export function LogoutButton({
  variant = "secondary",
  fullWidth = false,
  className,
  formClassName,
}: LogoutButtonProps) {
  return (
    <form action={logOut} className={formClassName}>
      <Button type="submit" variant={variant} fullWidth={fullWidth} className={className}>
        Log out
      </Button>
    </form>
  );
}
