# GarbOS v2 (Lite) — Scope & Build Plan

> Single-user, streamlined CRM for AFG Capital BD. Built in blocks. Each block is fully usable before the next begins. Anti-scope-creep is the prime directive: if a request doesn't strengthen a defined block, it's a squirrel.

---

## The Keystone: Action Chains

Everything in this system is an **action chain**: an ordered list of steps, where each step has an action type, a due date (or delay from the prior step), a completion state, and an optional note.

- A **sequence** is a reusable *template* for an action chain. Enrolling a lead instantiates a live chain from it.
- A **meeting's next steps** are an ad-hoc chain hanging off that meeting.
- A **boss-given task** is a short chain created by hand.
- The **daily task list** is a view: every incomplete chain step due today / this week.
- Clicking **"done"** completes a step, logs an activity (to contact AND company), advances the chain, and generates the next task.

Build this primitive once and correctly. Sequences and the daily task surface both fall out of it.

---

## Tech Stack (locked)

- **Frontend:** Next.js 15
- **Backend:** FastAPI (single API, emits OpenAPI)
- **Client:** typed TS client generated from the OpenAPI spec (replaces tRPC)
- **Database:** PostgreSQL 16
- **Deploy:** Docker Compose
- **No tRPC.** FastAPI is the one API. This keeps a future iOS app trivial (REST/OpenAPI) and keeps lead-scoring + enrichment logic in Python where it belongs.

---

## Architecture Principles

1. **Modular monolith, not microservices.** Clean domain modules (contacts, activities, chains, sequences, deals, tasks) inside one FastAPI app. Splittable later only if a real need appears.
2. **Single-user now, multi-user-ready.** Nullable `owner_id` on companies, contacts, activities, chains, deals, and tasks. Flip to multi-user later via a toggle, not a migration bloodbath.
3. **Custom types are data, not enums.** Activity types and pipeline stages live in tables so custom values persist and appear everywhere (especially across all sequences).
4. **Design-for-later hooks** (cheap fields/stubs now so deferred features are additive):
   - `owner_id` nullable everywhere -> multi-user
   - transcript/notes text field on meetings -> Otter.ai later
   - message-body field on email/LinkedIn steps -> Haiku generation later
   - `integrations`/`credentials` table stub -> ZoomInfo / PitchBook later
   - FastAPI + OpenAPI -> iOS app later
   - voice-friendly command surface kept in mind, not built

---

## Lifecycle Model

**Lead (scored) -> Prospect -> Opportunity -> Closed (Won/Lost)**

- **Lead:** a person or company that looks like a fit but hasn't shown interest. By far the largest volume (net-new logos). Has scoring.
- **Prospect:** has shown interest, not yet working with us. Small volume; many leads skip straight to Opportunity.
- **Opportunity:** real traction, a deal being worked to close. Moves through pipeline stages (below).

Status is a field on the record, not a separate object. Contacts and companies persist unchanged across the lifecycle.

---

## Core Data Model

- **companies** — org record; nullable `owner_id`
- **contacts** — person record; `company_id` FK; nullable `owner_id`
- **activities** — polymorphic, links to contact / company / deal; `activity_type_id`; optional note; `voicemail` bool (for calls)
- **activity_types** — built-in + custom; available across all sequences
- **action_chains** — belongs to contact / company / deal; status
- **chain_steps** — action type, due date / delay, completed, completed_at, note, responsible party (me / them / internal), optional `advances_stage_to`
- **sequences** — chain templates (named)
- **sequence_steps** — template steps: action type, delay, optional message body
- **deals** — `company_id`, `pipeline_stage_id`, amount, close_date, `owner_id`
- **pipeline_stages** — configurable, ordered
- **close_reasons** — captured on Closed Lost
- **lead_scores** — score on lead (scoring rules can grow later)
- **meetings** — notes/transcript text field; next-steps chain
- **tasks / reminders** — primarily a *view* over incomplete chain steps; plus a light table for standalone reminders
- **tags** — cheap labels
- **users** — single user now; table exists for the future
- **integrations / credentials** — stub for later enrichment APIs

---

## Opportunity Pipeline Stages

Derived from a real AFG deal. Each stage is gated by a real commitment milestone. Stored as configurable data.

1. **Qualifying** — fit confirmed, capex need real, mutual interest. *Exit: agree to exchange NDA.*
2. **NDA** — fresh NDA out and executing. *Exit: NDA signed.* (Most collapsible stage if you want five.)
3. **Financial Review** — collecting projections, board deck, CAPEX list, 3 yrs financials + interims. *Exit: enough to build terms.*
4. **Term Sheet** — capital markets review, terms drafted, presented, negotiated. *Exit: term sheet signed.*
5. **Due Diligence** — 2–3 week deep dive, doc review, redlines. *Exit: DD cleared.*
6. **Funding** -> **Closed Won.** Plus **Closed Lost** (with reason), reachable from any stage.

Chain steps can carry an `advances_stage_to` tag (e.g., completing "term sheet signed" advances Term Sheet -> Due Diligence).

---

## Activity Types (starter set)

Call (+ voicemail bool), Email, LinkedIn Connection Request, LinkedIn DM, LinkedIn InMail, Text, Meeting, Video Message, Marketing Sent, Conference / Event, Inbound, Other (custom, persists across all sequences).

Every activity supports an optional note. Activities show on the contact and roll up to the company; deal activities also roll up to the deal so searching a deal shows everything (client conversations, meetings, internal notes).

---

## Sequences

- Create multiple named sequences.
- Steps use the action types above; each step has a configurable delay from the prior step.
- Every action is performed by the user (GarbOS has no access to email / LinkedIn / phone). The system tracks and reminds, it does not send.
- Email / LinkedIn steps have a message-body field (typed now; Haiku-generated later).
- Enrolling a lead instantiates a chain. Reminders appear on the lead's page AND the dashboard.
- Clicking **done** on a step: marks it complete, logs the activity to contact + company, advances to the next step, generates the next reminder.
- Per-enrollment options: promote to Prospect / Opportunity, close (with reason), or auto-close after the final step.
- Reminders are the most important surface in the app. Treat them as first-class.

---

## Tasks & Reminders (the daily driver)

- Front page shows: **due today**, **due this week**, and **standalone reminders**.
- Every task is a chain step with a due date and a next step, unless the chain is marked complete.
- Boss-given tasks are manually created chains, tracked the same way.

---

## Dashboard

Boring and useful, single-user. Top to bottom:

1. Today's tasks (the hero).
2. This week's tasks.
3. Reminders.
4. Completed-activity feed with a day / week / month / year selector (e.g., "Acme — step 3 of sequence; Roadrunner — sequence done, no response; Coyote — new opportunity").

Visualizations (max three): activities-by-type (bar), lifecycle funnel leads -> prospects -> opps, activities-over-time (line).

---

## UI Principles

- Persistent **left nav**. Avoid hamburger menus where possible; don't rule them out.
- White background, black text, simple blue accent for buttons.
- Understated, modern, "boring Scandinavian designer."
- **Usability and speed first.** Fast to load, fast to use. Not award-winning, just frictionless.
- Claude Design used only to set design tokens + one or two hero screens. The app shell is built lean in code so every later feature inherits the look. Design does not drive feature scope.

---

## The Block Plan

Each block is independently usable. Stop after any block and still have a working tool.

- **Block 0 — Foundation.** Repo, Docker Compose, Next.js 15 + FastAPI + Postgres 16, OpenAPI typed-client pipeline, single-user auth, left-nav shell, design tokens. No features.
- **Block 1 — Companies + Contacts.** First-class, globally accessible records. Company -> many contacts. CRUD, search, company view aggregating its contacts.
- **Block 2 — Activities.** Polymorphic logging on contact + company, optional notes, activity_types table.
- **Block 3 — Lifecycle + Lead scoring.** Lead -> Prospect -> Opportunity status + lead scoring.
- **Block 4 — Action chains + Tasks + Reminders.** The primitive + the daily surface. Manual chains (boss tasks) usable immediately.
- **Block 5 — Sequences.** The engine that generates chains into Block 4. Full action menu, delays, done-to-advance, promote/close.
- **Block 6 — Deals + Pipeline.** Deal object, configurable stages, list + kanban, stale/stuck sort, activities roll up to deal.
- **Block 7 — Dashboard + Reports.** Visualizations + completed-activity log with time filter.

---

## Out of Scope (the firewall)

Real and good, explicitly NOT now. Designed-around so each is additive later, never a rewrite:

Otter.ai direct integration, Haiku message generation, voice control, iOS app, ZoomInfo / PitchBook / other enrichment, Matrix mode and UI flourishes, marketing automation, multiple pipelines, multi-user (data hooks only).

---

## Open / Revisit Later

- Expanded TAM verticals (EV, robotics, semiconductor, edge infra) — thesis + screening matrix, separate effort.
- Lead-scoring model sophistication (start simple, grow).
- Multi-pipeline once a real second deal type demands it.
