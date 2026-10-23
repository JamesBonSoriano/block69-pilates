// Admin Users: /admin/users
// Where it's used: the admin menu ("Users").
// No mockup for this page: it follows the admin card and table style
// (docs/designs/AdminBookings.html).
//
// What it shows: accounts (clients by default; admins or everyone with the
// chips), with search by name, email or mobile, and for each one their
// bookings, upcoming classes and last class.
// Actions (through src/lib/admin/setup-actions.ts, each with a confirm box):
//   - Deactivate / Reactivate -> admin_set_user_active
//   - Make admin / Make client -> admin_set_user_role
// The admin's OWN row has no buttons, and the database refuses it anyway
// (an admin can never deactivate themselves or remove their own admin role,
// not even with a direct update: migration 10's profile guard).
//
// Filters live in the address, e.g. /admin/users?q=ana&role=admin
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import { Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { ConfirmActionButton } from "@/components/admin/ConfirmActionButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { setUserActive, setUserRole } from "@/lib/admin/setup-actions";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { getAdminUsers } from "@/lib/data/admin-setup";
import { formatClassDate, formatManilaDate, initialsOf } from "@/lib/format";
import type { AdminUser } from "@/types/app";

export const metadata: Metadata = { title: "Users · Admin" };

// The role chips: which accounts to list ("" = everyone).
const ROLE_CHIPS = [
  { key: "client", label: "Clients" },
  { key: "admin", label: "Admins" },
  { key: "all", label: "Everyone" },
] as const;
type RoleKey = (typeof ROLE_CHIPS)[number]["key"];

// The Users page.
// Takes: searchParams (q = search text, role = a chip key).
// Gives back: the heading, then the live list in <Suspense>.
export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Users"
        intro="Client and admin accounts. Deactivated accounts keep their bookings and payments, but can't log in to book."
      />
      <Suspense fallback={<AdminLoading label="the accounts" />}>
        <UsersBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: chips, search and the list.
// Takes: the searchParams promise. Gives back: the filters and the accounts.
async function UsersBody({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, 100);
  const roleParam = firstParam(params.role);
  const role: RoleKey = ROLE_CHIPS.some((chip) => chip.key === roleParam) ? (roleParam as RoleKey) : "client";

  let result: { rows: AdminUser[]; totalMatches: number };
  try {
    result = await getAdminUsers(q, role === "all" ? "" : role);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the accounts" />;
  }
  const { rows, totalMatches } = result;

  // Builds this page's address for a role chip, keeping the search.
  // Takes: the chip key. Gives back: e.g. "/admin/users?q=ana&role=admin".
  const chipHref = (key: RoleKey) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (key !== "client") query.set("role", key);
    const text = query.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <nav aria-label="Filter by role">
          <ul className="flex flex-wrap gap-2">
            {ROLE_CHIPS.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chipHref(chip.key)}
                  scroll={false}
                  aria-current={chip.key === role ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                    chip.key === role
                      ? "border-brown bg-brown font-semibold text-card"
                      : "border-admin-active bg-white text-brown hover:bg-admin-bg",
                  )}
                >
                  {chip.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* A normal GET form: the search lives in the address */}
        <Form action="/admin/users" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {role !== "client" && <input type="hidden" name="role" value={role} />}
          <Input
            label="Search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, email or mobile"
            maxLength={100}
            autoComplete="off"
            className="sm:w-96"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 sm:flex-none">
              <Search aria-hidden="true" className="size-4" />
              Search
            </Button>
            {q && (
              <Link
                // Same chip, no search
                href={role === "client" ? "/admin/users" : `/admin/users?role=${role}`}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg"
              >
                Clear
              </Link>
            )}
          </div>
        </Form>
        <p role="status" className="text-xs text-muted">
          {totalMatches > rows.length
            ? `${totalMatches} accounts · showing the first ${rows.length}. Search to find someone.`
            : `${totalMatches} account${totalMatches === 1 ? "" : "s"}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <AdminCard className="text-sm text-muted">No accounts match this search.</AdminCard>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((user) => (
            <UserRow key={user.user_id} user={user} />
          ))}
        </ul>
      )}
    </>
  );
}

// One account: name, contact, booking counts, badges and the buttons.
// A card on phones; one wide row on laptops.
// Takes: the account. Gives back: an <li>.
function UserRow({ user }: { user: AdminUser }) {
  const name = user.full_name ?? user.email ?? "No name";
  const isAdminRole = user.role === "admin";

  return (
    <li className="grid gap-3 rounded-2xl border border-admin-line bg-white p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto] lg:items-center lg:px-5">
      {/* Who */}
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin-bg text-xs font-semibold text-brown"
        >
          {initialsOf(user.full_name ?? "", user.email ?? "")}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {name}
            {user.is_me && <Badge variant="info">This is you</Badge>}
            {isAdminRole && <Badge variant="neutral">Admin</Badge>}
            {!user.is_active && <Badge variant="error">Deactivated</Badge>}
          </p>
          <p className="break-all text-xs text-muted">{user.email}</p>
          <p className="text-xs text-muted">
            {user.mobile ?? "No mobile"}
            {user.instagram && <> · @{user.instagram}</>} · joined {formatManilaDate(user.created_at)}
          </p>
        </div>
      </div>

      {/* Bookings */}
      <p className="text-xs text-muted lg:text-[13px]">
        <span className="font-semibold text-ink">{user.bookings}</span> booking{user.bookings === 1 ? "" : "s"} ·{" "}
        <span className="font-semibold text-ink">{user.upcoming}</span> upcoming
        {user.last_class_date && <> · last class {formatClassDate(user.last_class_date).short}</>}
        {user.bookings > 0 && (
          <>
            {" "}
            ·{" "}
            <Link
              href={`/admin/bookings?q=${encodeURIComponent(user.email ?? name)}`}
              className="font-semibold text-brown underline underline-offset-2"
            >
              See bookings
            </Link>
          </>
        )}
      </p>

      {/* Buttons (never on the admin's own row) */}
      {user.is_me ? (
        <p className="text-xs text-muted lg:text-right">
          You can&apos;t deactivate yourself or change your own role. Ask another admin.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <ConfirmActionButton
            action={setUserActive}
            fields={{ user_id: user.user_id, active: user.is_active ? "false" : "true" }}
            label={user.is_active ? "Deactivate" : "Reactivate"}
            srLabel={` ${name}`}
            variant={user.is_active ? "danger" : "secondary"}
            confirm={
              user.is_active
                ? {
                    title: `Deactivate ${name}?`,
                    body:
                      `They are logged out the next time they open a private page, and can't book. Their ${user.upcoming} upcoming ` +
                      "booking(s) stay as they are, so cancel or move those first if needed. You can reactivate them later.",
                    confirmLabel: "Deactivate",
                  }
                : {
                    title: `Reactivate ${name}?`,
                    body: "They can log in and book again.",
                    confirmLabel: "Reactivate",
                  }
            }
          />
          <ConfirmActionButton
            action={setUserRole}
            fields={{ user_id: user.user_id, role: isAdminRole ? "client" : "admin" }}
            label={isAdminRole ? "Make client" : "Make admin"}
            srLabel={` ${name}`}
            variant="secondary"
            confirm={
              isAdminRole
                ? {
                    title: `Make ${name} a client?`,
                    body: "They lose access to every admin page straight away. Their own bookings stay as they are.",
                    confirmLabel: "Make client",
                  }
                : {
                    title: `Make ${name} an admin?`,
                    body: "They will see every booking, payment and client, and can change prices, settings and accounts. Only do this for cafe staff.",
                    confirmLabel: "Make admin",
                  }
            }
          />
        </div>
      )}
    </li>
  );
}
