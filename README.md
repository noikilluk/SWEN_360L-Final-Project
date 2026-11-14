# BatchBite

BatchBite is a preorder and production app for home bakers, student food stalls and small
kitchens. A business opens a limited **production batch** (for example 40 dessert boxes for
Thursday), customers order ahead and pick a collection time, and the kitchen works from one
reliable order book instead of scattered messages.

This repository holds the **Phase 2 (core implementation)** of the SWEN 360 / CMPE 460 project by
Group 10. It is an Expo / React Native app that runs on Android, iOS and the web. All data is stored
on the device, so it works offline and keeps its data between sessions.

- Design decisions, requirement coverage and the user guide: [`docs/PHASE2.md`](docs/PHASE2.md)
- Phase 1 design document (Sprint 1): requirements, wireframes, UML and the order state diagram

---

## Requirements

- [Node.js](https://nodejs.org) 20 or newer and npm
- One of:
  - the **Expo Go** app on an Android or iOS phone (same Wi-Fi as your computer), or
  - an Android emulator / iOS simulator, or
  - a web browser

## Install and run

```bash
npm install
```

```bash
npx expo start
```

Then press:

- `a` to open on an Android emulator or a connected Android phone,
- `i` to open on the iOS simulator (macOS only),
- `w` to open in the web browser,
- or scan the QR code in the terminal with Expo Go (Android) or the Camera app (iOS).

The first launch creates demo data (about two weeks of orders), which takes a second or two.

### Demo accounts

The log in screen has a **Demo accounts** panel that fills these in for you. Every demo password is
`batchbite`.

| Role | Username | What to try |
|---|---|---|
| Customer | `customer` | Browse batches, add to cart, pick a pickup slot, place an order, show the QR code, request a change |
| Business Owner | `owner` | Dashboard, create a batch, edit a product (creates a new version), approve change requests, refunds, insights, ingredients |
| Kitchen Staff | `kitchen` | Production board, tasks, scan or type a collection code to confirm pickup |
| Administrator | `admin` | Manage accounts, answer the pending password reset for `omar`, change settings, reset demo data |

Other demo customers: `sara`, `omar`, `yusuf`, `maryam`; other kitchen staff: `fatima`.

To start from a clean slate, log in as `admin` → **Settings** → **Reset demo data**.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run web` / `npm run android` / `npm run ios` | Start and open on that platform |
| `npm test` | Run the unit tests once (Jest) |
| `npm run test:watch` | Re-run tests on every change |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint with the Expo config |

## Features

**Core (Foundation)**

- Accounts with four roles (customer, business owner, kitchen staff, administrator), hashed passwords,
  log in lockout after repeated failures, and role-protected screens
- Customer home with search, filters (All, Open now, Closing soon, Pickup today), stock progress bars,
  deadlines and badges; sold-out batches show the next batch date
- Item page with options, quantity, ingredients and allergens, and a live price on the button
- Cart with pickup slots that show places left (full slots cannot be picked), a note for the baker and a
  simulated payment
- Batches with a maximum quantity, an order deadline that closes ordering automatically, and a
  collection time
- Orders move Confirmed → Preparing → Ready → Collected; invalid changes are blocked
- Owner dashboard of orders per batch

**Sprint 2 (previously out of scope)**

- **Ingredient planning, recipes and stock reservations**: recipes per product and option, stock
  reserved at checkout and used when production starts, low stock alerts and a shopping list
- **Production board and kitchen task assignment**
- **Order changes and refund handling**: customers request changes or cancellation; owners approve,
  and the price difference is charged or refunded automatically; owners can also refund directly
- **QR code collection verification**: every order has a QR code; staff scan it (camera) or type the
  6 character code
- **Notifications**: confirmation, preparing, ready, delay and missed collection for customers, plus
  new order, change request, low stock, task and password reset alerts for staff. Shown in an in-app
  inbox and, on phones, as device notifications
- **Sales and production insights**: revenue, orders, top products, sell-through, pickup and collection
  rates, ingredient cost and estimated margin
- **Recipe and price versioning**: changing a product's price or recipe creates a new version; confirmed
  orders keep the version they were bought with

## Project structure

```
src/
  app/            Screens (Expo Router: every file is a route)
    (auth)/       Log in, sign up, forgot password
    customer/     Customer tabs: home, orders, cart, profile
    owner/        Owner tabs: dashboard, batches, products, insights, more
    kitchen/      Kitchen tabs: board, tasks, scan, profile
    admin/        Admin tabs: users, settings, profile
    manage/       Owner and staff tools (batch form, product editor, ingredients, slots, ...)
    batch/[id]    Item page          order/[id]   Order details (QR code, status, payments)
  components/     Reusable UI (ui/ holds the design system: buttons, chips, fields, dialogs)
  domain/         Pure business rules and types (no React): order state machine, batch rules,
                  recipes, money, time, validation, permissions, insights
  services/       Use cases that change data: auth, catalogue, batches, cart, orders, production,
                  notifications, admin. Every check (permissions, stock, deadlines) happens here
  data/           Local database (transactions over AsyncStorage), schema, selectors, demo data
  state/          React provider, hooks and navigation helpers
  lib/            Platform integrations (expo-crypto, device notifications)
  test-utils/     Test helpers (Node crypto, controllable clock, scenarios, invariant checks)
```

## Testing

```bash
npm test
```

57 unit tests cover the business rules end to end through the real services, including:

- FR-04 sold out, FR-05 deadline, FR-06 full pickup slot
- NFR-01: two simultaneous checkouts for the last unit, only one succeeds
- the order state diagram (valid and invalid transitions, who may make them)
- cancellations, partial refunds, change requests and the price difference
- versioning (old orders keep their price and recipe)
- missed pickups and delays
- accounts: hashing, lockout, password reset, admin safeguards
- the database: atomic rollback, storage failures, recovery from corrupted data
- the demo data obeys every stock, slot and payment invariant at different times of day

## Notes and limitations

- Data lives on one device (AsyncStorage; `localStorage` on the web). There is no server, so two phones
  do not share orders. The services are written so a backend could replace the local database later.
- Payments are simulated. No real card is charged.
- Passwords are salted and hashed with SHA-256 (50 rounds). A real deployment with a server would use
  bcrypt or Argon2.
- Device notifications are local and need a phone (Expo Go or a development build). On the web the app
  shows them as in-app messages.
- QR scanning needs a camera; the code can always be typed instead.
