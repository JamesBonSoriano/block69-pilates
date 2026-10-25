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
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminBackLink, AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import { ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { updateUser } from "@/lib/admin/user-actions";
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
      <AdminBackLink href={`/admin/users/${user.user_id}`} label="Back to the account" />
      <AdminPageHeader
        overline="Edit user"
        title={name}
        intro="Change the client's contact details. The email and the role can't be changed here."
        actions={
          canEdit && (
            <ButtonLink href={`/admin/users/${user.user_id}/communications`} variant="secondary">
              <MessageSquare aria-hidden="true" className="size-4" />
              Communications
            </ButtonLink>
          )
        }
      />

      <AdminCard className="max-w-2xl">
        {canEdit ? (
          <AdminActionForm action={updateUser} submitLabel="Save details">
            <input type="hidden" name="user_id" value={user.user_id} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                name="full_name"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={user.full_name ?? ""}
                className="sm:col-span-2"
              />
              <PhoneInput label="Mobile" name="mobile" required defaultValue={user.mobile ?? ""} hint="11 digits, starting with 09" />
              <Input
                label="Instagram (optional)"
                name="instagram"
                maxLength={31}
                autoComplete="off"
                placeholder="@yourname"
                defaultValue={user.instagram ? `@${user.instagram}` : ""}
              />
              <BirthdayInput
                label="Birthday (optional)"
                name="birthday"
                defaultValue={formatBirthdayInput(user.birthday)}
                hint="MM/DD/YYYY"
              />
              {/* Shown so the admin knows who this is, but never sent */}
              <Input label="Email (can't be changed here)" name="email_shown" defaultValue={user.email ?? ""} disabled />
            </div>
          </AdminActionForm>
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
