// Page numbers under an admin table: "Showing 11–20 of 34", Previous,
// 1 2 3 …, Next (Version 1.4, Figma "User Management").
// Where it's used: the Schedule page (dated classes), the Users list and the
// Communications history.
//
// Each number is a normal link (?page=2), so the page in the address is the
// one shown, the browser's Back button works, and no JavaScript is needed.

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type AdminPaginationProps = {
  page: number; // the page shown now (1 = first)
  perPage: number;
  total: number; // how many rows there are in all
  noun: string; // what is counted, e.g. "users" (for "of 34 users")
  hrefFor: (page: number) => string; // the address of another page
  label: string; // for screen readers, e.g. "Users pages"
};

// The page numbers.
// Takes: the props above.
// Gives back: the summary and the links, or just the summary when
// everything fits on one page.
export function AdminPagination({ page, perPage, total, noun, hrefFor, label }: AdminPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <p role="status">
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </p>
      {pages > 1 && (
        <nav aria-label={label}>
          <ul className="flex flex-wrap items-center gap-1.5">
            <li>
              <PageLink href={page > 1 ? hrefFor(page - 1) : null} wide>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Previous
              </PageLink>
            </li>
            {pageList(page, pages).map((item, index) =>
              item === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true" className="px-1">
                  …
                </li>
              ) : (
                <li key={item}>
                  <PageLink href={hrefFor(item)} current={item === page}>
                    {item}
                    <span className="sr-only"> (page {item})</span>
                  </PageLink>
                </li>
              ),
            )}
            <li>
              <PageLink href={page < pages ? hrefFor(page + 1) : null} wide>
                Next
                <ChevronRight aria-hidden="true" className="size-4" />
              </PageLink>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

// One page link (or a greyed-out label when there's nowhere to go).
// Takes: the address (null = disabled), whether it's the page shown now,
// whether it's a wide "Previous"/"Next" button, and the text.
// Gives back: a link or a span.
function PageLink({
  href,
  current = false,
  wide = false,
  children,
}: {
  href: string | null;
  current?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const classes = cn(
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full text-[13px] font-semibold",
    wide ? "px-3" : "px-2",
    current ? "bg-brown text-card" : "border border-admin-line bg-white text-brown",
  );
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(classes, "opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? "page" : undefined}
      className={cn(classes, !current && "hover:bg-admin-bg", "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown")}
    >
      {children}
    </Link>
  );
}

// Which page numbers to show: all of them when there are 7 or fewer,
// otherwise the first, the last, and the pages next to the current one.
// Takes: the current page and how many pages. Gives back: e.g. [1, "gap", 4, 5, 6, "gap", 9].
function pageList(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, n) => n + 1);
  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const list: (number | "gap")[] = [1];
  if (around[0] > 2) list.push("gap");
  list.push(...around);
  if (around[around.length - 1] < pages - 1) list.push("gap");
  list.push(pages);
  return list;
}
