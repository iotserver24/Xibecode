---
description: The ultimate guide to Vue.js 3 development, featuring Composition API, Script Setup, Reactivity, and detailed best practices.
tags: vue, vue3, composition-api, script-setup, reactivity, frontend, framework, javascript, typescript
source: https://vuejs.org/guide
---

# Vue.js 3 Expert Skill

You are an expert Vue.js 3 developer. Your goal is to write clean, performant, and maintainable Vue code using the Composition API and TypeScript. When this skill is active, you must prioritize modern patterns (`<script setup>`, `ref`, `computed`) and avoid legacy Options API usage unless explicitly requested.

## Overview

Vue.js is a progressive framework for building user interfaces. Unlike monolithic frameworks, Vue is designed to be incrementally adoptable. The core library focuses on the view layer only, and is easy to pick up and integrate with other libraries or existing projects.

### Core Philosophies

1. **Declarative Rendering**: Vue extends standard HTML with a template syntax that allows us to declaratively describe HTML output based on JavaScript state.
2. **Reactivity**: Vue automatically tracks JavaScript state changes and efficiently updates the DOM when changes happen.

## Critical Concepts & Mental Models

### The Application Instance

Every Vue application starts by creating a new **Application Instance** with the `createApp` function.

```typescript
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')
```

### Single-File Components (SFC)

Vue projects typically use `*.vue` files (SFCs) which encapsulate the component's logic (JavaScript/TypeScript), template (HTML), and styles (CSS) in a single file.

```vue
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <button @click="count++">Count is: {{ count }}</button>
</template>

<style scoped>
button { font-weight: bold; }
</style>
```

### Composition API vs Options API

**Use the Composition API with `<script setup>` for all new projects.**
It offers better TypeScript support, better code organization (logic reuse via composables), and smaller bundle sizes suited for production.

## Reactivity: The Heart of Vue

### `ref()` vs `reactive()`

- **`ref()`**: Taking an inner value and returning a reactive and mutable ref object, which has a single property `.value` that points to the inner value.
  - **Best for**: Primitives (string, number, boolean), arrays, and replacing entire objects.
  - **Usage**: Access via `.value` in logic, auto-unwrapped in templates.

- **`reactive()`**: Returns a reactive proxy of the object/array.
  - **Best for**: Grouping related state deeply.
  - **Wait!**: `reactive` has limitations (destructuring loses reactivity, cannot hold primitives). **Prefer `ref` for consistency unless you have a specific use case.**

```typescript
import { ref, reactive } from 'vue'

const count = ref(0) // count.value
const state = reactive({ count: 0 }) // state.count
```

### Computed Properties

Cached based on their reactive dependencies. Only re-evaluate when dependencies change.

```typescript
const count = ref(1)
const double = computed(() => count.value * 2)
```

### Watchers

React to state changes to perform side effects (DOM mutation, async calls).

```typescript
watch(count, (newVal, oldVal) => {
  console.log(`count changed from ${oldVal} to ${newVal}`)
})

// watchEffect runs immediately and tracks dependencies automatically
watchEffect(() => console.log(count.value))
```

## Common Patterns & "The Right Way"

### 1. Script Setup (`<script setup>`)

This is the compile-time syntactic sugar for using Composition API. It is less verbose and more performant.

**Bad (Old Composition API):**

```vue
<script>
import { ref } from 'vue'
export default {
  setup() {
    const msg = ref('Hello')
    return { msg }
  }
}
</script>
```

**Good (Script Setup):**

```vue
<script setup>
import { ref } from 'vue'
const msg = ref('Hello')
</script>
```

### 2. Props & Emits (Typed)

Typing props and emits is crucial for maintainability.

```vue
<script setup lang="ts">
// Runtime declaration
// const props = defineProps({ foo: String })

// Type-only declaration (Preferred)
interface Props {
  foo: string
  bar?: number
}
const props = withDefaults(defineProps<Props>(), {
  bar: 10
})

const emit = defineEmits<{
  (e: 'change', id: number): void
  (e: 'update', value: string): void
}>()
</script>
```

### 3. v-model Components

Best practice for two-way data binding in custom components (Vue 3.4+ `defineModel`).

**Child Component:**

```vue
<script setup>
const model = defineModel()
</script>

<template>
  <input v-model="model" />
</template>
```

**Parent Component:**

```vue
<ChildComponent v-model="searchText" />
```

### 4. Composables (Logic Reuse)

Extract stateful logic into functions. Convention is `use...`.

```typescript
// useMouse.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  function update(event) {
    x.value = event.pageX
    y.value = event.pageY
  }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```

### 5. Suspense & Async Components

Handle async dependencies cleanly.

```vue
<script setup>
import { defineAsyncComponent } from 'vue'
const AsyncComp = defineAsyncComponent(() => import('./AsyncComp.vue'))
</script>

<template>
  <Suspense>
    <AsyncComp />
    <template #fallback>
      Loading...
    </template>
  </Suspense>
</template>
```

## Gotchas & Anti-Patterns

1. **Destructuring `props` loses reactivity**:

    ```typescript
    const props = defineProps<{ title: string }>()
    const { title } = props // ❌ Reactivity lost!
    // toKeep: const { title } = toRefs(props)
    ```

2. **Mutating props directly**: Props are read-only. Emit an event to update content or use `v-model`.

3. **Overusing `watch`**: Prefer `computed` logic where possible. Only use `watch` for side effects (API calls, logging), not for deriving state.

4. **`v-if` vs `v-show`**: `v-if` destroys/recreates DOM elements (expensive toggle). `v-show` just toggles CSS `display: none` (cheap toggle). Use `v-show` for frequent toggling.

## Ecosystem Essential Integrations

- **Routing**: `vue-router` is the standard. usage: `<router-view>` and `<router-link>`.
- **State Management**: **Pinia** is the recommended state manager (replaces Vuex). It's modular, type-safe, and supports DevTools.
- **Testing**: `Vitest` for unit/component testing. `Vue Test Utils` for mounting.

## Quick Reference

| Feature | Syntax | Notes |
| :--- | :--- | :--- |
| **State** | `const count = ref(0)` | Access `count.value` in JS, `{{ count }}` in template. |
| **Computed** | `const double = computed(() => c.value * 2)` | Read-only by default. |
| **Props** | `defineProps<Props>()` | Compiler macro, no import needed. |
| **Emits** | `defineEmits<Emits>()` | Compiler macro. |
| **Slots** | `<slot name="header"></slot>` | Parent: `<template #header>...</template>` |
| **Directives** | `v-if`, `v-for`, `v-bind` (:), `v-on` (@) | `:key` is mandatory in `v-for`. |
| **Lifecycle** | `onMounted`, `onUnmounted` | Import from 'vue'. |

## Example: Perfect Real-World Component

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

// 1. Type Definitions
interface User {
  id: number
  name: string
  role: 'admin' | 'user'
}

interface Props {
  initialUsers?: User[]
  loading?: boolean
}

// 2. Props & Emits
const props = withDefaults(defineProps<Props>(), {
  initialUsers: () => [],
  loading: false
})

const emit = defineEmits<{
  (e: 'select', user: User): void
}>()

// 3. State
const searchQuery = ref('')
const isExpanded = ref(false)

// 4. Computed
const filteredUsers = computed(() => {
  if (!searchQuery.value) return props.initialUsers
  const q = searchQuery.value.toLowerCase()
  return props.initialUsers.filter(u => u.name.toLowerCase().includes(q))
})

// 5. Methods
function handleSelect(user: User) {
  if (props.loading) return
  emit('select', user)
}

// 6. Lifecycle
onMounted(() => {
  console.log('UserList mounted')
})
</script>

<template>
  <div class="user-list">
    <div class="header">
      <input 
        v-model="searchQuery" 
        placeholder="Search users..." 
        class="search-input"
      />
      <button @click="isExpanded = !isExpanded">
        {{ isExpanded ? 'Collapse' : 'Expand' }}
      </button>
    </div>

    <div v-if="loading" class="loading">
      Loading...
    </div>

    <ul v-else-if="isExpanded" class="list">
      <li 
        v-for="user in filteredUsers" 
        :key="user.id" 
        class="list-item"
        @click="handleSelect(user)"
      >
        {{ user.name }} 
        <span class="badge" :class="user.role">{{ user.role }}</span>
      </li>
    </ul>
    
    <div v-else class="summary">
      {{ filteredUsers.length }} users found.
    </div>
  </div>
</template>

<style scoped>
.user-list { border: 1px solid #ccc; padding: 1rem; border-radius: 8px; }
.header { display: flex; gap: 1rem; margin-bottom: 1rem; }
.search-input { flex: 1; padding: 0.5rem; }
.list { list-style: none; padding: 0; }
.list-item { 
  display: flex; 
  justify-content: space-between; 
  padding: 0.5rem; 
  cursor: pointer; 
}
.list-item:hover { background: #f5f5f5; }
.badge { font-size: 0.8em; padding: 0.2em 0.5em; border-radius: 4px; }
.badge.admin { background: #ffcccc; color: #cc0000; }
.badge.user { background: #e0f0ff; color: #0066cc; }
</style>
```
