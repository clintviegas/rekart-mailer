# Rekart Mailer

**Premium SaaS Email Automation Platform** — production-grade Next.js 15 frontend.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| UI Components | Shadcn UI (Base UI) |
| State Management | Zustand |
| Server State | TanStack React Query v5 |
| HTTP Client | Axios |
| Forms | React Hook Form + Zod |
| Animations | Framer Motion |
| Charts | Recharts |
| Notifications | Sonner |
| Theming | next-themes |

## Project Structure

```
src/
  app/
    (auth)/          # Auth pages (login, signup, forgot/reset password)
    (dashboard)/     # Dashboard pages (dashboard, campaigns, templates, etc.)
  components/
    ui/              # Shadcn UI primitives
    shared/          # Shared components (Logo, PageHeader, Skeleton, etc.)
    layouts/         # Layout components (Sidebar, Navbar, MobileNav)
    charts/          # Recharts chart components
  modules/
    auth/            # Auth forms and schemas
    dashboard/       # Dashboard-specific components
    campaigns/       # Campaigns module
    templates/       # Templates module
    analytics/       # Analytics module
    settings/        # Settings module
    workspace/       # Workspace module
  services/          # API service layer
  store/             # Zustand stores (auth, ui, workspace)
  hooks/             # Custom React hooks
  lib/               # Utilities (API client, env, utils)
  types/             # TypeScript types
  constants/         # App constants and route definitions
  providers/         # React context providers
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local

# Start development server
npm run dev
```

## Environment Variables

```env
NEXT_PUBLIC_APP_NAME=Rekart Mailer
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

## Features

- **Collapsible sidebar** with smooth animation
- **Responsive mobile drawer** sidebar
- **Theme switching** (light/dark/system)
- **Auth pages** with form validation (login, signup, forgot/reset password)
- **Dashboard** with stats cards, area chart, donut chart, and campaign table
- **Campaigns** management page
- **Templates** grid page
- **Analytics** with performance charts
- **Contacts** management
- **Settings** page
- **Zustand** stores for auth, UI state, and workspace
- **TanStack Query** with smart retry/caching config
- **Axios** with JWT token injection and refresh token rotation
- **Zod** schema validation on all forms
- **Framer Motion** animations throughout
- **Error boundary** component
- **Skeleton loaders** for loading states
- **Breadcrumb navigation**
- **Workspace switcher**
- **Profile dropdown**
