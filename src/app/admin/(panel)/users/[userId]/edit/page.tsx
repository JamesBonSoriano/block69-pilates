// Admin Edit user: /admin/users/<user id>/edit
// Where it's used: the pencil button on the Users list and "Edit details"
// on View user.
// Version 1.4: the admin can change a client's full name, mobile (11 digits
// starting with 09), Instagram and birthday. NOT the email (it changes only
// through the client's own verified email change) and NOT the role (admins
// are set with SQL). Saved by updateUser() (src/lib/admin/user-actions.ts)
// through admin_update_user (migration 20), which checks the same rules.
// A "Communications" button opens that client's Communications page.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check.

import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ConfirmActionButton } from "@/components/admin/ConfirmActionButton";
import { UserDetailsEditor } from "@/components/admin/UserDetailsEditor";
import { AdminBackLink, AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { ButtonLink } from "@/components/ui/Button";
import { setClientActive } from "@/lib/admin/user-actions";
import { requireAdmin } from "@/lib/auth/user";
import { getAdminUserDetails } from "@/lib/data/admin-users";
import { formatBirthdayInput } from "@/lib/validation";
import type { AdminUserDetails } from "@/types/app";

export const metadata: Metadata = { title: "Edit user · Admin" };

// The Edit user page.
// Takes: params (the user id from the address).
// Gives back: the live form in <Suspense> (the Back link is inside it).
export default function AdminEditUserPage({ params }: PageProps<"/admin/users/[userId]/edit">) {
  return (
    <AdminPage>
      <Suspense fallback={<AdminLoading label="the account" blocks={1} />}>
        <EditBody params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the heading and the form.
// Takes: the params promise. Gives back: the form, a short note for
// accounts that can't be edited, or "page not found".
async function EditBody({ params }: { params: PageProps<"/admin/users/[userId]/edit">["params"] }) {
  await requireAdmin();
  const { userId } = await params;

  let user: AdminUserDetails | null;
  try {
    user = await getAdminUserDetails(userId);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this account" />;
  }
  if (!user) notFound();

  const name = user.full_name ?? user.email ?? "Deleted account";
  const canEdit = user.role === "client" && !user.is_deleted;

  return (
    <>
      <AdminBackLink href="/admin/users" label="Back to Users" />
      <AdminPageHeader
        overline="Edit user"
        title={name}
        intro="Change the client's contact details. The email and the role can't be changed here."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/users/${user.user_id}`} variant="secondary">View User</ButtonLink>
            {canEdit && (
            <ButtonLink href={`/admin/users/${user.user_id}/communications`} variant="secondary">
              <MessageSquare aria-hidden="true" className="size-4" />
              Communications
            </ButtonLink>
            )}
          </div>
        }
      />

      <AdminCard className="max-w-2xl">
        {canEdit ? (
          <>
            <UserDetailsEditor userId={user.user_id} email={user.email ?? ""} initial={{
              full_name: user.full_name ?? "", mobile: user.mobile ?? "",
              instagram: user.instagram ? `@${user.instagram}` : "",
              birthday: formatBirthdayInput(user.birthday),
            }} />
            <div className="mt-6 border-t border-admin-line pt-4">
              {/* Staff can restore access without changing the booking history. */}
              <ConfirmActionButton action={setClientActive} fields={{ user_id: user.user_id, active: user.is_active ? "no" : "yes" }}
                label={user.is_active ? "Deactivate account" : "Reactivate account"}
                variant={user.is_active ? "danger" : "secondary"}
                confirm={{
                  title: user.is_active ? "Deactivate this client?" : "Reactivate this client?",
                  body: user.is_active ? "Only staff can restore access. Existing bookings and payments are kept." : "The client will be able to sign in again.",
                  confirmLabel: user.is_active ? "Deactivate account" : "Reactivate account",
                }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            {user.is_deleted
              ? "This account was deleted by its owner, so it can't be edited."
              : "Admin accounts aren't edited here."}
          </p>
        )}
      </AdminCard>
    </>
  );
}
