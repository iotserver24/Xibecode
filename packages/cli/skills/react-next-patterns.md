---
description: React and Next.js components, hooks, and data fetching
tags: react, nextjs, frontend
---

# React & Next.js Patterns

## Components

- Prefer small, focused components; colocate styles and tests when the repo does.
- Keep side effects in `useEffect` (or server-only code in Server Components) with correct dependency arrays.

## State

- Lift state only as high as needed; prefer local state or existing stores (Redux, Zustand, etc.) to match the codebase.

## Next.js

- Use App Router vs Pages Router conventions already in the project — do not mix routers in one route tree.
- For Server Actions and forms, follow existing patterns for validation and error handling.

## Performance

- Memoize only when profiling or clear re-render cost; avoid premature `useMemo`/`useCallback` everywhere.
