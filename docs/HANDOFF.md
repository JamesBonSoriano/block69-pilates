# Block 69 Pilates: how to finish the build (any Claude account)

The presentation is on **Saturday, Oct 24, 2026**. Everything Claude Code needs is saved in this folder: CLAUDE.md, docs/PROGRESS.md and docs/prompts/. So you can switch accounts at any time and nothing is lost.

---

## 1. If you hit the usage limit: switch accounts

1. In the Claude Code panel, type `/logout`, then `/login`. Log in with the other account.
   - In the terminal version it's the same: `/logout`, then `/login`.
2. Make sure VS Code still has **this same folder** open (block69-pilates).
3. Type `/clear` to start fresh.
4. Paste the **continue message** below.

**Continue message** (use it any time a step was cut off midway):
```
Continue from where docs/PROGRESS.md says the last session stopped. Follow the prompt file for that step in docs/prompts/. Re-run the checks (npm run test:db, type check, lint, build) before going further. Never run any git command.
```

The new account follows the same rules, because they're written in CLAUDE.md. Never let it touch git; you commit with GitHub Desktop.

---

## 2. The steps left, in order

Start each step with `/clear`, then paste the start message. Answer the plan it shows you, then test with its checklist, run any cleanup SQL, and **commit in GitHub Desktop**. Commit after every working step, so there's always a version you can present.

| Step | Start message to paste | Must have for Saturday? |
| --- | --- | --- |
| 11 part 2 | `Continue Step 11 part 2 from where docs/PROGRESS.md says you stopped. Follow @docs/prompts/11-admin-part2.md, including item 6.` | Yes |
| 12 | `Follow @docs/prompts/12-paymongo.md` | **Yes, the core of the demo** |
| R1 | Attach revisions.pdf, then: `Follow @docs/prompts/R1-revisions-client.md` | Yes (group revisions) |
| R2 | Attach revisions.pdf, then: `Follow @docs/prompts/R2-revisions-admin.md` | Yes (group revisions) |
| R3 | Attach revisions.pdf, then: `Follow @docs/prompts/R3-revisions-email.md` | Nice to have. The buttons show "Coming soon" without it. |
| 13 | `Follow @docs/prompts/13-deploy.md` | **Yes, aim for Friday** |
| 14 | `Follow @docs/prompts/14-emails-reminders.md` | Nice to have. Skip if short on time and call it "next phase". |
| 15 | `Follow @docs/prompts/15-final-check.md` | Yes, at least the demo data and demo script parts |

**If time is short, do it in this order: 11 part 2, 12, R1, R2, 13 (deploy), 15 (demo data and script), R3, then 14.**

---

## 3. Things only you can do (no Claude needed)

### Before Step 12: PayMongo keys
1. Sign up at paymongo.com. You can stay in **test mode**, no business papers needed.
2. In the dashboard, go to **Developers → API Keys** and copy the **secret test key** (starts with `sk_test_`).
3. Paste it into `.env.local` on the line Claude Code tells you. Never paste it in chat.
4. Test payments: on PayMongo's test page, GCash and Maya show "Authorize" or "Fail" buttons. For cards, Claude Code will give you a test card number.

### Step 13: deploying on Vercel
Claude Code writes `docs/DEPLOY.md` with the exact clicks. In short:
1. In GitHub Desktop, make sure everything is committed and pushed.
2. Vercel deploys the **main** branch by default. Your work is on **Version-1**. Pick one:
   - Easiest: in GitHub Desktop, switch to `main`, then **Branch → Merge into current branch → Version-1**, then **Push origin**.
   - Or, in Vercel, change the Production Branch to `Version-1`.
3. Go to vercel.com, sign in with GitHub, then **Add New → Project**, import the repo, and paste the environment variables.
4. In Supabase, open **Authentication → URL Configuration**. Set the Site URL to your Vercel URL and add `https://YOUR-SITE.vercel.app/**` to Redirect URLs. Keep the localhost entries too.
5. In PayMongo, add a test webhook to `https://YOUR-SITE.vercel.app/api/paymongo/webhook`. Paste its secret into Vercel as `PAYMONGO_WEBHOOK_SECRET`, then click **Redeploy**.

### Step 14: emails (only if you do it)
1. Use one Gmail account for the project, with 2-Step Verification ON.
2. Go to myaccount.google.com/apppasswords, make an App Password, and paste it where Claude Code says (`.env.local` and Vercel).
3. In Supabase, open **Project Settings → Authentication → SMTP**, turn on custom SMTP and enter the same Gmail details.
4. Change the two email templates exactly as Claude Code says, then turn **Confirm email** back ON.

---

## 4. Night before the presentation
- [ ] The live Vercel site opens on a phone and a laptop.
- [ ] Run `demo-seed.sql` in the Supabase SQL Editor so the admin pages have data to show.
- [ ] Do one full test booking and payment on the live site.
- [ ] Log in once as admin and once as the test client, so you remember both passwords.
- [ ] Read `docs/DEMO-SCRIPT.md` with the group and decide who presents which part.
- [ ] Have a backup: screenshots or a screen recording of the full flow, in case the internet fails.
- [ ] Supabase free projects pause after about a week with no use. Open the dashboard the day before to make sure it's awake.

## 5. After the presentation (before real use by the cafe)
- [ ] Reset the Supabase database password. It was shared in a chat earlier.
- [ ] Fill in the real GCash/BPI details, phone, instructor name and Chat With Us link in admin Settings.
- [ ] Have the cafe review the Registration Agreement and policies.
- [ ] Switch PayMongo to live mode only after the cafe's PayMongo account is verified.
- [ ] Remove the demo data with `demo-cleanup.sql`.
