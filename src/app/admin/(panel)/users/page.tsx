// Admin Users: /admin/users
// Where it's used: the admin menu ("Users") and the Dashboard.
// Version 1.4 (PDF pages 25-26, Figma "User Management"): a table of client
// accounts (Name, Email, Phone, Actions) with search, sort (A-Z or newest)
// and pages of 10. Each row has three icon buttons:
//   View            /admin/users/<id>                 (details and history)
//   Edit            /admin/users/<id>/edit            (name, mobile, Instagram, birthday)
//   Communications  /admin/users/<id>/communications  (send an email, see what was sent)
// The Deactivate and Make admin buttons were removed: admins are set with SQL.
// On phones the table becomes one card per client.
//
// Search, sort and page live in the address, e.g. /admin/users?q=ana&sort=newest&page=2
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check (admin_list_users).

import { Eye, MessageSquare, Pencil, Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { getAdminUsers } from "@/lib/data/admin-setup";
import { initialsOf } from "@/lib/format";
import type { AdminUser } from "@/types/app";

export const metadata: Metadata = { title: "Users · Admin" };

// Clients per page.
const PER_PAGE = 10;

// The sort choices (the value is what admin_list_users takes).
const SORTS = [
  { value: "name", label: "Sort: A–Z" },
  { value: "newest", label: "Sort: Newest" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

// The Users page.
// Takes: searchParams (q = search text, sort, page).
// Gives back: the heading, then the live list in <Suspense>.
export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Users"
        intro="Client accounts: contact details, bookings and emails."
      />
      <Suspense fallback={<AdminLoading label="the accounts" />}>
        <UsersBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: search, sort, the table and the page numbers.
// Takes: the searchParams promise. Gives back: one card with everything.
async function UsersBody({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, 100);
  const sortParam = firstParam(params.sort);
  const sort: SortKey = sortParam === "newest" ? "newest" : "name";
  const pageParam = Number(firstParam(params.page));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  let result: { rows: AdminUser[]; totalMatches: number };
  try {
    result = await getAdminUsers(q, "client", { sort, page, perPage: PER_PAGE });
    // A page past the end (e.g. after a search): show page 1's count instead
    if (result.rows.length === 0 && page > 1) {
      result = { rows: [], totalMatches: (await getAdminUsers(q, "client", { sort, perPage: 1 })).totalMatches };
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the accounts" />;
  }
  const { rows, totalMatches } = result;

  // Builds this page's address for another page, keeping the search and sort.
  // Takes: the page number. Gives back: e.g. "/admin/users?q=ana&page=2".
  const hrefFor = (n: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (sort !== "name") query.set("sort", sort);
    if (n > 1) query.set("page", String(n));
    const text = query.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  return (
    <AdminCard className="flex flex-col p-0 lg:p-0">
      {/* A normal GET form: the search and sort live in the address (back to page 1) */}
      <Form action="/admin/users" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end lg:p-6">
        <Input
          label="Search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, email or mobile"
          maxLength={100}
          autoComplete="off"
          className="sm:w-80"
        />
        <Select
          label="Sort"
          name="sort"
          defaultValue={sort}
          options={SORTS.map((item) => ({ value: item.value, label: item.label }))}
          className="sm:w-44"
        />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1 sm:flex-none">
            <Search aria-hidden="true" className="size-4" />
            Search
          </Button>
          {(q || sort !== "name") && (
            <Link
              href="/admin/users"
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg"
            >
              Clear
            </Link>
          )}
        </div>
      </Form>

      {rows.length === 0 ? (
        <p className="border-t border-admin-line px-4 py-5 text-sm text-muted lg:px-6">
          {totalMatches > 0 ? (
            <>
              This page is empty.{" "}
              <Link href={hrefFor(1)} className="font-semibold text-brown underline underline-offset-2">
                Go to page 1
              </Link>
            </>
          ) : (
            "No clients match this search."
          )}
        </p>
      ) : (
        <>
          {/* ===== Laptop and tablet: table ===== */}
          <div className="hidden border-t border-admin-line md:block">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Clients</caption>
              <thead>
                <tr className="border-b border-admin-line bg-admin-bg/50 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th scope="col" className="px-4 py-3 font-semibold lg:px-6">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold lg:px-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.user_id} className="border-b border-admin-bg last:border-b-0 hover:bg-admin-bg/40">
                    <td className="px-4 py-2.5 lg:px-6">
                      <UserName user={user} />
                    </td>
                    <td className="break-all px-4 py-2.5">{user.email || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{user.mobile ?? "—"}</td>
                    <td className="px-4 py-2.5 lg:px-6">
                      <UserActions user={user} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== Phone: one card per client ===== */}
          <ul className="flex flex-col divide-y divide-admin-bg border-t border-admin-line md:hidden">
            {rows.map((user) => (
              <li key={user.user_id} className="flex flex-col gap-2 px-4 py-3">
                <UserName user={user} />
                <p className="break-all text-xs text-muted">
                  {user.email || "No email"} · {user.mobile ?? "No mobile"}
                </p>
                <UserActions user={user} />
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="border-t border-admin-line">
        <AdminPagination
          page={page}
          perPage={PER_PAGE}
          total={totalMatches}
          noun={totalMatches === 1 ? "client" : "clients"}
          label="Clients pages"
          hrefFor={hrefFor}
        />
      </div>
    </AdminCard>
  );
}

// The avatar, name and status badges of one client.
// Takes: the account. Gives back: the name block.
function UserName({ user }: { user: AdminUser }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin-bg text-[11px] font-semibold text-brown"
      >
        {initialsOf(user.full_name ?? "", user.email ?? "")}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
        <Link href={`/admin/users/${user.user_id}`} className="underline-offset-2 hover:underline">
          {user.full_name ?? (user.email ? user.email : "Deleted account")}
        </Link>
        {!user.is_active && <Badge variant="error">Deactivated</Badge>}
      </span>
    </div>
  );
}

// The View, Edit and Communications icon buttons of one client.
// Takes: the account. Gives back: three round links (44px, each with a name
// for screen readers).
function UserActions({ user }: { user: AdminUser }) {
  const name = user.full_name ?? user.email ?? "this client";
  const actions = [
    { href: `/admin/users/${user.user_id}`, label: `View ${name}`, Icon: Eye },
    { href: `/admin/users/${user.user_id}/edit`, label: `Edit ${name}`, Icon: Pencil },
    { href: `/admin/users/${user.user_id}/communications`, label: `Communications with ${name}`, Icon: MessageSquare },
  ];
  return (
    <div className="flex gap-1.5 md:justify-end">
      {actions.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          title={label}
          className="inline-flex size-11 items-center justify-center rounded-full bg-admin-bg text-brown transition-colors hover:bg-admin-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
        >
          <Icon aria-hidden="true" className="size-4" />
        </Link>
      ))}
    </div>
  );
}
