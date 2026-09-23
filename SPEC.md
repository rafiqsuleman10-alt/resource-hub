# Resource Hub: build specification

A working web app for the final-year Industrial Engineering design project **"Design of an Intelligent Shared Resource Hub for University Campuses"** (DUT, Steve Biko Campus). Students reserve, collect, return and report faults on shared equipment stored in smart lockers; technicians manage stock across locker nodes. Physical lockers do not exist yet, so the locker is **simulated by a kiosk page** that runs on any tablet or laptop.

`prototype.html` in this folder is the approved clickable prototype. Match its flows, wording, colours and typography. Treat it as the design reference, not as code to copy.

## Goals

1. Works well on a phone **and** on a desktop browser (responsive, not a stretched phone layout).
2. Real data in a real database, real logins, deployed to a public URL.
3. Demonstrates the design decisions in the report: three locker nodes, walking time to each node, pooled stock, return to any node, fault reporting linked to maintenance, battery-backup status.
4. Safe to show publicly: **demo accounts only**, no real student personal information.

## Tech stack (use exactly this unless you tell me why not)

- **Next.js** (App Router, TypeScript) with Tailwind CSS
- **Supabase** for Postgres database and authentication (email + password)
- Deployed on **Vercel**, source on **GitHub**
- Font: Atkinson Hyperlegible (Google Fonts). Colours from the prototype: slate `#2C3A48`, ink `#1E2A36`, teal `#0C7A5E`, amber `#A8620A`, coral `#B63A24`, background `#E9EEF2`. Support dark mode.
- Keep secrets in `.env.local`. Never commit keys. Use Supabase Row Level Security on every table.

## Roles and demo accounts

Seed these accounts and show them on the login page with a "Try the demo" section (one tap to sign in as each). Disable open sign-up.

| Role | Email | Can do |
|---|---|---|
| Student | student1@demo.hub, student2@demo.hub | Browse, reserve, collect, return, extend, report faults, see own loans |
| Technician | tech@demo.hub | Everything in the admin dashboard |
| Maintenance officer | maint@demo.hub | Work orders and maintenance only |

Use one simple demo password and print it on the login page. Add a "Reset demo data" button for the technician that restores the seed data.

## Data model

Tables (snake_case, with created_at timestamps):

- **profiles**: id (auth user), display_name, role (student / technician / maintenance), card_uid (fake demo value), faculty, year_of_study. No student numbers, ID numbers or phone numbers.
- **zones**: id (S, A, C, E, D, H, SR), name, position (0 to 1 along the campus, north to south)
- **locker_nodes**: id (S, C, SR), name, place, position, battery_backup_ok (boolean), online (boolean)
- **walk_times**: zone_id, node_id, minutes
- **item_types**: id, name, category, unit_cost_zar, criticality (safety / medium / low), abc_class, fsn_class, loan_hours_options (array), service_after_loans
- **items**: id, item_type_id, tag (e.g. VC-0412), home_node_id, current_node_id (null while on loan), status (available / reserved / on_loan / in_service / retired), loan_count
- **compartments**: id, node_id, number, size (S / M / L), item_id (nullable)
- **reservations**: id, student_id, item_id, node_id, compartment_id, pin (4 digits), hold_until, status (active / collected / cancelled / expired)
- **loans**: id, student_id, item_id, issued_at, due_at, returned_at, return_node_id, extended (boolean), condition_on_return (good / minor / damaged)
- **fault_reports**: id, reporter_id, item_id (nullable), node_id, compartment_id (nullable), reason (door_did_not_open / wrong_item / damaged / missing_part / other), note, status (open / in_progress / closed), work_order_ref
- **maintenance_records**: id, item_id, trigger (usage_threshold / fault_report), opened_at, closed_at, notes

## Seed data (from the design report)

**Zones and positions:** S-Blocks 0.10, North residences 0.06, Library 0.30, Berea Residence 0.38, Admin & clinic 0.47, Sports centre 0.58, South residences 0.90.

**Locker nodes:** Node S (S-Blocks, ground floor, 0.12), Node C (Library entrance, 0.31), Node SR (South residences, Gate 6, 0.88). Maintenance and Facilities is the servicing hub (not a student locker).

**Walking minutes (zone → S, C, SR):** S 1/3/9, North res 4/5/10, Library 3/1/7, Berea 4/3/6, Admin 5/3/5, Sports 6/4/4, South res 9/7/1.

**Item types and units per node (S / C / SR), loan options:**

| Item | Category | Cost R | S | C | SR | Loan options |
|---|---|---|---|---|---|---|
| Scientific calculator | Measuring | 450 | 9 | 0 | 4 | 1 or 2 days |
| Laptop | Tech | 9500 | 4 | 6 | 2 | 2 or 3 days |
| Tablet | Tech | 5200 | 3 | 4 | 3 | 2 or 3 days |
| Charger / power bank | Tech | 350 | 5 | 6 | 5 | 4 hours or overnight |
| HDMI / Ethernet cable | Tech | 150 | 3 | 4 | 2 | 4 hours or overnight |
| Laboratory coat | Lab & safety | 320 | 7 | 2 | 3 | 1 or 2 days |
| Safety goggles | Lab & safety | 120 | 8 | 3 | 4 | 4 hours or overnight |
| Hard hat | Lab & safety | 180 | 3 | 1 | 2 | 4 hours or overnight |
| Vernier caliper | Measuring | 650 | 3 | 1 | 1 | 4 hours or overnight |
| Micrometer | Measuring | 900 | 2 | 1 | 1 | 4 hours or overnight |
| DSLR camera | Camera & AV | 12000 | 1 | 3 | 1 | 2 or 3 days |
| Tripod | Camera & AV | 800 | 1 | 3 | 1 | 2 or 3 days |
| Projector | Camera & AV | 7500 | 1 | 1 | 0 | 4 hours or overnight |
| Umbrella | Everyday | 150 | 3 | 3 | 4 | 4 hours or overnight |
| Sports equipment kit | Everyday | 1200 | 0 | 1 | 4 | 4 hours |
| Wheelchair | Health & access | 4500 | 1 | 1 | 1 | 1 or 2 days |
| First aid kit | Health & access | 600 | 1 | 1 | 1 | 4 hours |

Mark safety goggles, lab coats, hard hats, wheelchairs and first aid kits as **safety** criticality. Generate one `items` row per unit with a tag, and enough compartments per node to hold them (about 51 at S, 44 at C, 39 at SR). Seed student1 with two active loans: a Vernier caliper due today at 16:00 and a laptop due tomorrow.

## Business rules

- A reservation holds an item for **30 minutes**, then expires and the item returns to stock. Show a live countdown.
- Student chooses the collection node; list nodes sorted by walking time from the student's chosen "You're near" zone (remember the choice).
- If a due date falls on a South African public holiday, move it to 10:00 the next working day and tell the student why.
- Items can be **returned to any node**. The return node becomes the item's current node.
- A loan can be **extended once by one day** if no other student has an active reservation waiting for that item type at that node.
- Overdue loans show clearly on the student's loans and in the admin dashboard.
- Returning with condition "minor" or "damaged" opens a fault report; the item goes to `in_service`.
- Every fault report gets a work order reference (WO-####) and appears for maintenance.
- When an item's loan_count reaches its type's `service_after_loans`, it automatically goes to `in_service` with a maintenance record (trigger = usage_threshold). Use 100 for calculators, cables, umbrellas and goggles; 40 for laptops, tablets and cameras; 25 for wheelchairs; 60 for everything else.
- "Door did not open" or "wrong item" during collection moves the reservation to another free compartment at the same node.
- If a node's `battery_backup_ok` is false, show a warning on that node and on the kiosk.

## Screens

**Student (mobile-first, also good on desktop with a wider two-column layout):**
1. Browse: search, category chips, each item with total free and nearest node with walking minutes.
2. Item: campus strip (the horizontal campus diagram from the prototype showing S, C, SR, the student's position and minutes to each), node choice, loan period, due date, Reserve.
3. Ready to collect: countdown, node, compartment, backup PIN, Change locker, Cancel.
4. My loans: due progress, Return, Extend, Report a fault.
5. Report a fault: reason, optional note, optional photo upload (Supabase Storage), submit.
6. Help: how it works, technician desk hours, larger text and high-contrast toggles.

**Locker kiosk (`/kiosk/[nodeId]`, designed for a tablet in landscape, no login):**
- Idle screen with node name and backup status.
- "Tap card" is simulated by typing or selecting a demo card UID, or entering the reservation PIN.
- Shows the compartment grid with the open compartment highlighted; "I've closed the door"; "Door didn't open"; "Wrong item inside".
- Return mode: identify item by tag (simulated RFID), then condition check.
- Returns to idle automatically after 20 seconds of inactivity.

**Technician dashboard (desktop-first):**
- KPIs: items on loan, available, reserved, overdue, in service, today's fill rate (successful reservations ÷ reservation attempts), utilisation (on-loan units ÷ total units).
- Stock by node and item type, with a **rebalancing suggestion**: for each item type, move units from the node with the most free units to a node with zero, and show the suggestion list.
- Overdue loans, open faults and work orders, maintenance due.
- Chart of loans per day for the last 14 days (seed some history so the chart isn't empty).
- Reset demo data.

**Maintenance:** list of open work orders and usage-triggered services; mark in progress and closed (closing returns the item to available at the servicing node's nearest locker, S).

## Quality bar

- Responsive from 360 px phones to wide desktops. Check both.
- Keyboard accessible, visible focus, colour contrast AA, respects reduced motion.
- Clear empty and error states in plain language (see the prototype's wording style).
- Footer on every page: "Demo system for a DUT Industrial Engineering design project. Sample data only."
- A privacy page explaining what data is stored and why, in line with POPIA principles.
- README with setup, environment variables, how to seed, and how to deploy.

## Not in scope

Real locker hardware, real RFID, payments, real SMS or email (show notifications in-app instead), mobile app stores.

## Build in phases

After each phase: run it locally, fix errors, tell me exactly how to test it, then commit to git.

1. Project setup, Supabase schema with RLS, seed script, demo login.
2. Student browse, item, reserve, countdown, cancel, change locker.
3. Kiosk collection and return, loans, extend, holiday rule.
4. Faults, work orders, maintenance and usage threshold.
5. Technician dashboard, rebalancing, chart, reset demo data.
6. Polish: responsive desktop layout, dark mode, accessibility, privacy page, README.
7. Deployment to Vercel with me, step by step.
