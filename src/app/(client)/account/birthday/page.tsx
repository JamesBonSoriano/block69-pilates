// The old "Add your birthday" address: /account/birthday?next=<page>
// Where it's used: only old links and bookmarks (Revisions part 1). Change 17
// replaced the page with "Finish your profile" (/account/finish-profile),
// which also asks for a missing mobile number. This forwards there, keeping
// a safe "next".

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { FINISH_PROFILE_PATH } from "@/lib/auth/user";

export const metadata = { robots: { index: false } };

// The page: forwards straight away.
// Takes: searchParams (?next=...).
// Gives back: nothing (the forward happens inside <Suspense>, because the
// address is only known when someone visits).
export default function OldBirthdayPage({ searchParams }: PageProps<"/account/birthday">) {
  return (
    <Suspense fallback={null}>
      <Forward searchParams={searchParams} />
    </Suspense>
  );
}

// Reads ?next= and forwards to the new page.
// Takes: the searchParams promise. Gives back: nothing (always redirects).
async function Forward({ searchParams }: Pick<PageProps<"/account/birthday">, "searchParams">): Promise<never> {
  const next = safeNextPath(firstParam((await searchParams).next));
  redirect(`${FINISH_PROFILE_PATH}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
}
