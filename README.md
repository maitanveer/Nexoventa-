# Nexoventa Medical Billing & RCM

Nexoventa is a production-style Next.js platform for medical billing services, revenue cycle support, and practical training in Gilgit-Baltistan, Pakistan. The project combines a premium public marketing website with a secure admin workspace for managing courses, batches, applications, and announcements.

## Overview

- Public-facing company website with service information, FAQ, contact details, privacy, and terms pages
- Training catalog with month/batch selection and seat availability
- Student admission workflow with server-side validation and duplicate protection
- PostgreSQL-backed data model via Prisma 7
- Secure admin authentication with scrypt hashes and signed HttpOnly cookies
- Administrative review of applications, batch status, and announcements
- WhatsApp follow-up and public contact flows

## Tech stack

- Next.js 16 App Router
- TypeScript
- Prisma 7
- PostgreSQL / Neon
- React 19
- Tailwind CSS v4
- Base UI and Lucide icons
- Zod validation
- Node.js crypto for password hashing and session signing

## Project structure

- app/: route pages and server actions
- components/: reusable UI, branding, and layout components
- lib/: auth, validation, utility, and database helpers
- prisma/: schema, migrations, seed, and admin bootstrap script
- public/: static assets

## Local installation

1. Install dependencies:
   npm install
2. Create a local environment file from the template:
   copy .env.example .env
   or on PowerShell:
   Copy-Item .env.example .env
3. Fill in the required environment variables.
4. Generate the Prisma client:
   npm run db:generate
5. Create the database schema:
   npm run db:migrate
6. Seed the safe demo content:
   npm run db:seed
7. Create the first admin account:
   npm run admin:create -- admin@example.com "your-strong-password" "Nexoventa Admin"
8. Start the app:
   npm run dev
9. Open the app in the browser:
   http://localhost:3000

## Environment variables

Add the following values to your .env file (do not commit this file):

- DATABASE_URL
  - Required for Prisma and database access.
  - Example: postgresql://USER:PASSWORD@HOST:5432/nexoventa?sslmode=require
  - For Neon, use the connection string from your Neon project.

- AUTH_SECRET
  - Required for admin session signing.
  - Must be a long, random value such as a 32+ character secret string.
  - Example: replace-with-a-long-random-secret

- NEXT_PUBLIC_APP_URL
  - Public app base URL.
  - Local example: http://localhost:3000

- NEXT_PUBLIC_WHATSAPP_NUMBER
  - Public WhatsApp number used for click-to-chat links.
  - Example: +923555252025

Configure `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, and the existing `NEXT_PUBLIC_WHATSAPP_NUMBER` in Vercel for each environment. Payment instructions are displayed directly on the admission confirmation screen; no payment provider or receipt-storage configuration is needed.

## PostgreSQL / Neon setup

1. Create a PostgreSQL database in Neon or another managed PostgreSQL provider.
2. Copy the connection string into DATABASE_URL.
3. Ensure the database accepts SSL if required by your provider.
4. Run Prisma migration and generation tasks after the database is ready.

## Prisma setup

Useful commands:

- npm run db:generate
- npm run db:migrate
- npx prisma migrate deploy --config prisma7.config.ts
- npx prisma validate --config prisma7.config.ts

The Prisma schema is defined in [prisma/schema.prisma](prisma/schema.prisma). The project uses the Prisma 7 PostgreSQL provider and the generated client under [lib/generated/prisma](lib/generated/prisma).

## Database seed

The seed script in [prisma/seed.ts](prisma/seed.ts) creates safe, company-approved demo data only:

- Nexoventa company record context
- Medical Billing course
- September 2026 training batches
- Four training slots
- Publishable announcement content

It does not create fake student records or fabricated personal applicant information.

## Admin account creation

To create the first admin user:

npm run admin:create -- admin@example.com "your-strong-password" "Nexoventa Admin"

This writes a secure scrypt password hash to the database and creates an administrator with the ADMIN role.

## Running locally

- Start dev server:
  npm run dev
- Run lint:
  npm run lint
- Run TypeScript checks:
  npm run typecheck
- Run production build:
  npm run build

## 15-seat capacity system

Each batch stores both `capacity` and `reservedSeats` and the default capacity is 15. The application enforces the limit at the server/database layer instead of trusting frontend state.

The safety model is:

- A batch must not exceed 15 active reserved seats
- Seat reservation happens within a transaction
- The update is conditional and atomic
- A full batch is rejected before a new reservation is recorded
- Rejected or cancelled applications release reserved seats in a separate transaction
- Duplicate submissions are prevented by application-level checks

This prevents race conditions where two applicants try to claim the last seat at nearly the same time.

## Student admission flow

The application flow is:

1. Training page lists open batches
2. User chooses a month and slot
3. User fills the application form
4. Server validates all required fields
5. Server verifies the selected batch is still open
6. Database transaction reserves a seat atomically
7. Duplicate application protection runs before creation
8. Student + pending application records are created and a seat is reserved atomically
9. The student sees the PKR 18,000 course fee, UBL/SadaPay details, and PKR 1,500 minimum advance
10. The student opens WhatsApp, manually attaches the payment screenshot, and presses Send
11. An authorized admin reviews the application and payment manually, then confirms or rejects the application
12. Only confirmed applications appear in the student directory

## Admin dashboard

The admin area includes protected access to:

- Courses
- Batches
- Training slots
- Applications
- Students
- Announcements

Protected routing is enforced via the signed admin session helpers in [lib/auth.ts](lib/auth.ts). The dashboard is designed for operational review and application management.

## WhatsApp integration

The public site uses a WhatsApp CTA based on the configured number in `NEXT_PUBLIC_WHATSAPP_NUMBER`. This keeps contact and follow-up flows aligned with the current business number without hardcoding the environment into app logic.

## Deployment

Before deployment:

- Set the production DATABASE_URL
- Set a production AUTH_SECRET
- Set NEXT_PUBLIC_APP_URL
- Set NEXT_PUBLIC_WHATSAPP_NUMBER
- Run migrations in the target environment
- Ensure the app builds successfully with `npm run build`

Apply existing migrations in deployment with `npx prisma migrate deploy --config prisma7.config.ts` (or `npm run db:migrate` locally after reviewing the SQL). Do not use database reset or force-reset commands. The manual WhatsApp workflow does not require a new migration; historical payment records and their schema are retained.

Do not deploy until the required production environment variables are configured.

## Contact

Nexoventa Medical Billing & RCM
Phone: 03169244682
WhatsApp: 0355 5252025
Email: alijanbasharat@gmail.com
