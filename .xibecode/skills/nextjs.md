---
description: nextjs development guide
tags: nextjs, docs, learned
source: https://nextjs.org/docs
---

```yaml
description: Comprehensive guide to building full-stack web applications with Next.js, emphasizing the App Router for modern React development, including patterns, best practices, and pitfalls.
tags: nextjs, react, full-stack, app-router, server-components, routing, typescript, performance
source: https://nextjs.org/docs
```

## Role & Persona

You are an expert Next.js developer with deep knowledge of the App Router, React Server Components, and full-stack patterns. Your mindset prioritizes clean, modern, type-safe code that leverages server-side rendering for performance and SEO. Always aim for scalable architectures: use static rendering where possible, fetch data on the server, and minimize client-side JavaScript. Write idiomatic code that follows Next.js conventions, integrates seamlessly with TypeScript and ESLint, and avoids unnecessary re-renders or hydration mismatches.

## Overview

Next.js solves the challenges of building production-ready React applications by providing a framework that handles routing, data fetching, rendering strategies, and optimizations out-of-the-box. It abstracts away complex configurations for bundling, transpilation, and deployment, allowing developers to focus on user experience.

Use Next.js when creating dynamic, SEO-friendly web apps like e-commerce sites, blogs, or dashboards that require server-side logic, API routes, or static generation. It's ideal for full-stack development but overkill for simple client-side SPAs.

Core philosophies: 
- **File-system based routing**: Routes mirror your folder structure for intuitive organization.
- **Hybrid rendering**: Blend static, server, and client rendering for optimal performance (e.g., static for marketing pages, dynamic for user data).
- **Developer experience first**: Zero-config TypeScript, built-in linting, and Turbopack for fast iteration.
- **React-centric evolution**: Built on React, embracing Server Components to reduce bundle size and improve initial load times.

## Critical Concepts (Mental Models)

Think of Next.js as a "React amplifier" that extends React's component model to the server. The **App Router** (recommended over the legacy Pages Router) introduces **React Server Components (RSC)** as the default, shifting the mental model from client-only rendering to a server-client continuum.

### Why and How: Server vs Client Components
- **Server Components** (default in App Router): Render on the server, fetching data closer to the source (e.g., databases). They don't ship JavaScript to the client, reducing bundle size by 90%+ in many cases. Analogy: Like a restaurant kitchen preparing meals (server) before serving (client)—efficient but non-interactive.
  - *How*: Mark with `'use server'` directive or keep as default. They can access file system, environment vars, but not browser APIs.
- **Client Components**: For interactivity (e.g., forms, state). Marked with `'use client'`. Hydrate on the client for event handling.
  - *Why*: Prevents shipping unused code; server components are "one-way" (no state, no hooks like `useState`).

### Lifecycle and Data Flow
1. **Request Handling**: Incoming request hits the server. Next.js matches the URL to a file in `/app` (e.g., `/app/dashboard/page.tsx` for `/dashboard`).
2. **Rendering**:
   - **Static Rendering** (default): Pre-render at build time for speed/SEO. Use for content that rarely changes.
   - **Dynamic Rendering**: On-demand server render for personalized data (e.g., user profiles). Trigger with `cookies()`, `headers()`, or dynamic functions like `fetch` without caching.
   - **Streaming**: Use `<Suspense>` to load UI incrementally—shell renders first, then async parts (e.g., data fetches).
3. **Data Fetching**: Always prefer server-side (e.g., `fetch` in Server Components). Data flows top-down: layouts/pages fetch, pass as props to children. Avoid client fetches unless necessary (e.g., real-time updates).
4. **Navigation**: Client-side via `<Link>`, with built-in prefetching. Server Actions for mutations (form submissions) to keep state server-synced.
5. **Architecture**: Tree of components (layouts wrap pages). Metadata, error boundaries, and loading states are parallel files (e.g., `loading.tsx`).

Analogy: App Router is like a layered cake—root layout is the base (shared HTML structure), pages are slices (route-specific content), and Client Components are the interactive toppings added client-side.

## Installation & Setup (Brief)

### Standard Installation
Use `create-next-app` for a batteries-included setup:

```bash
npx create-next-app@latest my-app --typescript --eslint --tailwind --app --src-dir --import-alias "@/*"
cd my-app
npm run dev
```

This enables TypeScript, ESLint, Tailwind CSS, App Router, src/ dir, and `@/*` aliases. Visit `http://localhost:3000`.

Manual setup:
```bash
npm init -y
npm i next@latest react@latest react-dom@latest
```
Add to `package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx"
  }
}
```
Create `/app/layout.tsx` (required root layout):
```tsx
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```
And `/app/page.tsx`:
```tsx
export default function HomePage() {
  return <h1>Hello, Next.js!</h1>;
}
```

### Essential Configuration
- **tsconfig.json**: Auto-generated with paths for aliases (e.g., `"@/*": ["./src/*"]`).
- **next.config.js**: Minimal; add for custom webpack/Turbopack tweaks.
- **ESLint**: Use `eslint.config.mjs` for flat config. Enable Next.js plugin.
- System reqs: Node.js >=20.9, modern browsers (Chrome 111+).

## Common Patterns & "The Right Way"

Embrace Server Components for data fetching and rendering. Use layouts for shared UI (e.g., navbars). Integrate with ecosystem like Prisma for DB, Vercel for deploy.

### Routing and Layouts (Modern App Router Way)
Old Way (Pages Router): `pages/index.js` with `getServerSideProps`.
New Way: File-based in `/app`.

Example: Nested layout and page.
```
/app/
  layout.tsx          // Root: wraps all
  page.tsx            // /
  dashboard/
    layout.tsx        // Dashboard shell
    page.tsx          // /dashboard
```

`app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>Shared Nav</nav>  // Server-rendered, no JS shipped
        {children}
      </body>
    </html>
  );
}
```

`app/dashboard/layout.tsx`:
```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h2>Dashboard Header</h2>
      {children}
    </div>
  );
}
```

`app/dashboard/page.tsx` (Server Component with data fetch):
```tsx
// Server-side fetch: caches by default, revalidates on navigation
async function getData() {
  const res = await fetch('https://api.example.com/data', { next: { revalidate: 3600 } });
  return res.json();
}

export default async function DashboardPage() {
  const data = await getData();
  return <ul>{data.map((item: any) => <li key={item.id}>{item.name}</li>)}</ul>;
}
```

### Linking and Navigation
Use `<Link>` for client-side nav with prefetch.

```tsx
import Link from 'next/link';

export default function Nav() {
  return (
    <nav>
      <Link href="/" prefetch={false}>Home</Link>  // No prefetch for rarely visited
      <Link href="/dashboard">Dashboard</Link>     // Auto-prefetches on hover
    </nav>
  );
}
```

### Data Fetching and Mutations (Server Actions)
Fetch in Server Components. For forms, use Server Actions (newer than API routes).

`app/actions.ts`:
```ts
'use server';  // Marks as server-only

export async function createPost(formData: FormData) {
  'use server';
  // Validate and mutate (e.g., DB insert)
  const title = formData.get('title') as string;
  // ... await db.posts.create({ data: { title } });
  revalidatePath('/posts');  // Invalidate cache
}
```

`app/posts/page.tsx`:
```tsx
'use client';  // Client for form state
import { createPost } from './actions';
import { useFormState } from 'react-dom';  // Built-in form handling

export default function PostsPage() {
  const [state, formAction] = useFormState(createPost, null);
  return (
    <form action={formAction}>
      <input name="title" />
      <button type="submit">Create</button>
      {state?.error && <p>{state.error}</p>}
    </form>
  );
}
```

### Integration: Images and Metadata
Use `next/image` for optimization.

```tsx
import Image from 'next/image';

export default function Page() {
  return <Image src="/profile.png" alt="Profile" width={100} height={100} priority />;  // Priority for LCP
}
```

Metadata in `layout.tsx`:
```tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My App',
  description: 'Description',
};
```

## Gotchas & Anti-Patterns

- **Hydration Mismatches**: Don't use browser-only APIs (e.g., `window`) in Server Components—leads to errors. Solution: Move to Client Components or check `typeof window !== 'undefined'`.
- **Over-fetching on Client**: Avoid `useEffect` + `fetch` in Client Components; fetch server-side and pass props. Performance hit: Extra round-trips, larger bundles.
- **Ignoring Caching**: `fetch` caches by default—use `{ cache: 'no-store' }` for dynamic data, but sparingly (increases server load). Pitfall: Stale data in static renders.
- **Nested Client Components**: Excessive `'use client'` bloats JS. Keep 80% server-side; only client for interactivity.
- **Security**: Server Actions run on server—validate inputs to prevent injection. Don't expose secrets in Client Components (use env vars prefixed `NEXT_PUBLIC_`).
- **Performance**: Dynamic routes without `generateStaticParams` force SSR—use for user-specific pages. Avoid global CSS in Client Components (use CSS Modules).
- **Anti-Pattern**: Mixing Pages and App Router—migrate fully to App for RSC. Forgetting root layout causes build errors.

Common Mistake: Using `useState` in Server Components—impossible, as they have no lifecycle. Always check directives.

## API Reference (High-Frequency)

Focus on App Router essentials. Types from `@types/react` and Next.js.

- **Link** (from `next/link`): `<Link href="/path" replace>Content</Link>`
  - Props: `href: string`, `prefetch?: boolean` (default true), `replace?: boolean`.
  - Use: Client navigation with soft nav.

- **Image** (from `next/image`): `<Image src={string | StaticImport} alt={string} width={number} height={number} />`
  - Props: `priority?: boolean` (LCP optimization), `fill?: boolean` (responsive).
  - Benefit: Auto-resizing, lazy-loading.

- **fetch** (extended in Server Components): `await fetch(url, { next: { revalidate: number | false, tags: string[] } })`
  - Options: `cache: 'force-cache' | 'no-store'`, `next.revalidate` for ISR.
  - Returns: Promise<Response>.

- **Suspense** (from `react`): `<Suspense fallback={<Loading />}> <AsyncComponent /> </Suspense>`
  - Use: Streaming boundaries for data fetches.

- **Metadata** (export from layout/page): `export const metadata: Metadata = { title: string, description?: string, openGraph?: OGType }`
  - Type: `import { Metadata } from 'next'`.

- **Server Actions**: `async function action(formData: FormData) { 'use server'; ... }`
  - Helpers: `revalidatePath(path: string)`, `revalidateTag(tag: string)`, `redirect(url: string)`.

- **useFormState** (from `react-dom`): `const [state, formAction] = useFormState(action, initialState)`
  - For progressive enhancement in forms.

- **generateMetadata** (async function in page/layout): `export async function generateMetadata({ params }: Props): Promise<Metadata>`
  - Dynamic metadata based on route params.