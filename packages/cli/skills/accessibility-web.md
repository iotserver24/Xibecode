---
description: a11y for web UIs — semantics, keyboard, and screen readers
tags: accessibility, a11y, frontend
---

# Web Accessibility

## Basics

- Use semantic HTML: `button` for actions, `a` for navigation, headings in order.
- Every interactive control must be reachable and operable via keyboard.
- Provide visible focus styles that match the design system.

## Media and content

- Images need useful `alt` text; decorative images use empty `alt=""`.
- Form inputs must be associated with labels (`htmlFor` / `id` or `aria-label` when design requires it).

## Dynamic UI

- For dialogs and drawers, trap focus and restore it on close when patterns exist in the codebase.
- Announce important async updates with `aria-live` regions if the UI already uses them.
