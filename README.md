# Resource Hub

A working web app for the DUT Industrial Engineering design project **"Design of an Intelligent Shared Resource Hub for University Campuses"**. Students reserve, collect and return shared equipment from smart lockers; technicians manage stock across three locker nodes. It is a demo with sample data only.

- `SPEC.md` is the full brief. `prototype.html` is the approved design.
- Built with Next.js (App Router, TypeScript, Tailwind CSS) and Supabase (database and logins).

## Progress

| Phase | What | Status |
|---|---|---|
| 1 | Project setup, database with security rules, seed data, demo login | Done |
| 2 | Browse, item, reserve, countdown, cancel, change locker | Done |
| 3 | Kiosk collection and return, loans, extend, holiday rule | Next |
| 4 | Faults, work orders, maintenance, usage threshold | |
| 5 | Technician dashboard, rebalancing, chart, reset demo data | |
| 6 | Polish: desktop layout, dark mode toggle, accessibility, privacy page | |
| 7 | Deploy to Vercel | |

## Folder guide

| Path | What's in it |
|---|---|
| `src/app/` | The pages. `login/` is the login page; `page.tsx` is the home page. |
| `src/app/(student)/` | The student screens: `browse`, `items/[typeId]` (reserve), `reservation` (countdown, change locker, cancel), `loans` and `help`. `actions.ts` holds the buttons' server code. |
| `src/components/` | Pieces used on several pages, such as the campus strip. |
| `src/lib/student.ts` | Loads the logged-in student, their location and stock counts. |
| `src/lib/supabase/` | How the site connects to Supabase. |
| `src/lib/demo.ts` | The demo accounts and the demo password. |
| `src/proxy.ts` | Runs before every page: keeps you logged in and sends logged-out visitors to `/login`. |
| `supabase/migrations/` | The database, as SQL files. Run them in order. |
| `scripts/seed.ts` | Creates the demo logins and loads the demo data (`npm run seed`). |
| `supabase/tests/` | Automatic checks of the security rules (for developers). |

## Demo accounts

All use the password **`DemoHub2026!`** (set in `src/lib/demo.ts`).

| Role | Email |
|---|---|
| Student (has two loans) | student1@demo.hub |
| Student | student2@demo.hub |
| Technician | tech@demo.hub |
| Maintenance officer | maint@demo.hub |

## Setting it up

You need [Node.js](https://nodejs.org) 20 or newer and a free [Supabase](https://supabase.com) account.

### 1. Create the Supabase project

1. On supabase.com, click **New project**. Name it `resource-hub`, choose a database password (save it somewhere safe) and pick the region nearest to you.
2. Turn off public sign-up: **Authentication → Sign In / Providers**, switch off **Allow new users to sign up**, and save. Only the demo accounts will exist.

### 2. Create the database tables

1. In Supabase, open **SQL Editor** and click **New query**.
2. Open `supabase/migrations/20260923000001_schema.sql`, copy all of it, paste it in, and click **Run**. You should see "Success. No rows returned".
3. Do the same with `supabase/migrations/20260923000002_demo_data.sql`.

Then run `supabase/migrations/20260923000003_reservations.sql` the same way (phase 2: reserving).

Always run migration files in order (by the number at the start of the name). Later phases add more files; run only the new ones.

### 3. Add your keys

Copy `.env.example` to a new file called `.env.local` and fill in the three values from Supabase (the **Connect** button at the top of the project, or **Project Settings → API**):

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the **anon** (or **publishable**) key. It's safe for this key to be public.
- `SUPABASE_SERVICE_ROLE_KEY`: the **service_role** (or **secret**) key. **Keep this private.** It skips every security rule and is only used by the seed script.

`.env.local` is listed in `.gitignore`, so it is never committed.

### 4. Install, seed and run

```bash
npm install
npm run seed     # creates the demo logins and loads the demo data
npm run dev      # starts the site at http://localhost:3000
```

Run `npm run seed` again at any time to put all the demo data back to how it started.

## How the security works (Row Level Security)

Every table has Row Level Security switched on, so the database itself decides what each logged-in person may see:

- **Students** can read the catalogue, lockers and walking times, but only their **own** loans, reservations and fault reports. They can change only their "You're near" setting, not their role.
- **Technicians** can see and change everything, and can reset the demo data.
- **Maintenance officers** see items, fault reports and maintenance records, but not students' loans.
- **Visitors who aren't logged in** see nothing.

## Checks

```bash
npm run lint        # code style
npm run typecheck   # TypeScript errors
npm run build       # full production build
```

`npm run test:db` loads the migrations into a throwaway local PostgreSQL database and checks the security rules above (for example, "student 1 can't see student 2's fault report") and the reservation rules (30-minute holds, one hold at a time, change locker, holiday due dates). It needs a local PostgreSQL server; set `PGHOST` and `PGPORT` to point at it. Never run it against the real Supabase project.

## Notes on the demo data

- Stock per node, walking times, costs and loan periods come from the design report (see `SPEC.md`).
- Tags follow the prototype (e.g. `VC-0412`, `LT-0087`).
- The ABC, FSN and criticality classes are estimates (ABC by share of total stock value). Adjust them in `supabase/migrations/20260923000002_demo_data.sql` if the report's analysis differs.
- Each node has a few spare compartments of every size, so a reservation can move to another compartment. Node S holds 55 units, so it has 61 compartments rather than the "about 51" in the brief.
- A hold lasts 30 minutes. There's no background timer: whenever a page shows stock, the database first ends any holds whose time is up and puts those items back.
- If a loan would end on a South African public holiday, it's due at 10:00 on the next working day instead. The holiday list (2026 and 2027) is in the demo data.
- The seed also creates 14 days of past loans (for the dashboard chart), one open fault (WO-1001, a cracked hard hat) and one calculator due for its 100-loan service, so the maintenance screens have something to show.
