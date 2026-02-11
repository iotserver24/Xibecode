---
description: Skill learned from https://pinia.vuejs.org — 5 pages scraped
tags: learned, docs, pinia
source: https://pinia.vuejs.org
---

# pinia

> Learned from [https://pinia.vuejs.org](https://pinia.vuejs.org) — 5 pages

## Pinia | The intuitive store for Vue.js

> Source: https://pinia.vuejs.org

Pinia | The intuitive store for Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    

    

    

    

    

  

  

    

Skip to content

Pinia

The intuitive store for Vue.js

Type Safe, Extensible, and Modular by design. Forget you are even using a store.

Get Started

Demo

RuleKit

 

Watch Video Introduction

Get the Pinia Cheat Sheet

💡 Intuitive

Stores are as familiar as components. API designed to let you write well organized stores.

🔑 Type Safe

Types are inferred, which means stores provide you with autocompletion even in JavaScript!

⚙️ Devtools support

Pinia hooks into Vue devtools to give you an enhanced development experience.

🔌 Extensible

React to store changes and actions to extend Pinia with transactions, local storage synchronization, etc.

🏗 Modular by design

Build multiple stores and let your bundler code split them automatically.

📦 Extremely light

Pinia weighs ~1.5kb, you will forget it's even there!

Gold Sponsors

Silver Sponsors

Become a Sponsor!

---

## Defining a Store | Pinia

> Source: https://pinia.vuejs.org/core-concepts

Defining a Store | Pinia

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    
    
    
    
    

    

    

    

    

  

  

    

Skip to content

Menu

Return to top

CodeRabbit

Become a sponsor

VueMastery

Controla

Route Optimizer and Route Planner Software

SendCloud

The official

Vue.js Certification

Get certified!

Defining a Store 
​

Master this and much more with a free video from Mastering Pinia

Before diving into core concepts, we need to know that a store is defined using 
defineStore()
 and that it requires a 
unique
 name, passed as the first argument:

js

import

 {

 defineStore

 }

 from

 '

pinia

'

// You can name the return value of `defineStore()` anything you want,

// but it's best to use the name of the store and surround it with `use`

// and `Store` (e.g. `useUserStore`, `useCartStore`, `useProductStore`)

// the first argument is a unique id of the store across your application

export

 const

 useAlertsStore

 =

 defineStore

(

'

alerts

'

,

 {

  // other options...

})

This 
name
, also referred to as 
id
, is necessary and is used by Pinia to connect the store to the devtools. Naming the returned function 
use...
 is a convention across composables to make its usage idiomatic.

defineStore()
 accepts two distinct values for its second argument: a Setup function or an Options object.

✨

Vibe code Vue apps with confidence

RuleKit

Option Stores 
​

Similar to Vue's Options API, we can also pass an Options Object with 
state
, 
actions
, and 
getters
 properties.

js

export

 const

 useCounterStore

 =

 defineStore

(

'

counter

'

,

 {

  state

:

 ()

 =>

 ({

 count

:

 0

,

 name

:

 '

Eduardo

'

 }),

  getters

:

 {

    doubleCount

:

 (

state

)

 =>

 state

.

count

 *

 2

,

  },

  actions

:

 {

    increment

()

 {

      this

.

count

++

    },

  },

})

You can think of 
state
 as the 
data
 of the store, 
getters
 as the 
computed
 properties of the store, and 
actions
 as the 
methods
.

Option stores should feel intuitive and simple to get started with.

Setup Stores 
​

There is also another possible syntax to define stores. Similar to the Vue Composition API's 
setup function
, we can pass in a function that defines reactive properties and methods and returns an object with the properties and methods we want to expose.

js

export

 const

 useCounterStore

 =

 defineStore

(

'

counter

'

,

 ()

 =>

 {

  const

 count

 =

 ref

(

0

)

  const

 name

 =

 ref

(

'

Eduardo

'

)

  const

 doubleCount

 =

 computed

(()

 =>

 count

.

value

 *

 2

)

  function

 increment

()

 {

    count

.

value

++

  }

  return

 {

 count

,

 name

,

 doubleCount

,

 increment

 }

})

In 
Setup Stores
:

ref()
s become 
state
 properties

computed()
s become 
getters

function()
s become 
actions

Note that you 
must
 return 
all state properties
 in setup stores for Pinia to pick them up as state. In other words, you cannot have 

private
 state properties in stores
. Not returning all state properties or 
making them readonly
 will break 
SSR
, devtools, and other plugins.

Setup stores bring a lot more flexibility than 
Option Stores
 as you can create watchers within a store and freely use any 
composable
. However, keep in mind that using composables will get more complex when using SSR.

Setup stores are also able to rely on globally 
provided
 properties like the Router or the Route. Any property 
provided at the App level
 can be accessed from the store using 
inject()
, just like in components:

ts

import

 {

 inject

 }

 from

 '

vue

'

import

 {

 useRoute

 }

 from

 '

vue-router

'

import

 {

 defineStore

 }

 from

 '

pinia

'

export

 const

 useSearchFilters

 =

 defineStore

(

'

search-filters

'

,

 ()

 =>

 {

  const

 route

 =

 useRoute

()

  // this assumes `app.provide('appProvided', 'value')` was called

  const

 appProvided



...(truncated)

---

## API Reference | Pinia

> Source: https://pinia.vuejs.org/api

API Reference | Pinia

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    
    
    
    
    

    

    

    

    

  

  

    

Skip to content

Menu

Return to top

CodeRabbit

Become a sponsor

VueMastery

Controla

Route Optimizer and Route Planner Software

SendCloud

The official

Vue.js Certification

Get certified!

API Reference 
​

Modules 
​

Module

Description

@pinia/nuxt

-

@pinia/testing

-

pinia

-

---

## Cookbook | Pinia

> Source: https://pinia.vuejs.org/cookbook

Cookbook | Pinia

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    
    
    
    
    

    

    

    

    

  

  

    

Skip to content

Menu

Return to top

CodeRabbit

Become a sponsor

VueMastery

Controla

Route Optimizer and Route Planner Software

SendCloud

The official

Vue.js Certification

Get certified!

Cookbook 
​

✨

Vibe code Vue apps with confidence

RuleKit

Migrating from Vuex ≤4
: A migration guide for converting Vuex ≤4 projects.

HMR
: How to activate hot module replacement and improve the developer experience.

Testing Stores (WIP)
: How to unit test Stores and mock them in component unit tests.

Composing Stores
: How to cross use multiple stores. e.g. using the user store in the cart store.

Options API
: How to use Pinia without the composition API, outside of 
setup()
.

Migrating from 0.0.7
: A migration guide with more examples than the changelog.

---

## Pinia | The intuitive store for Vue.js

> Source: https://pinia.vuejs.org/zh

Pinia | The intuitive store for Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    

    

    

    

    

  

  

    

Skip to content

Pinia

符合直觉的 
Vue.js 状态管理库

类型安全、可扩展性以及模块化设计。
甚至让你忘记正在使用的是一个状态库。

开始使用

Demo 演示

RuleKit

 

观看视频介绍

获取 Pinia 速查表

💡 所见即所得

与组件类似的 Store。其 API 的设计旨在让你编写出更易组织的 store。

🔑 类型安全

类型可自动推断，即使在 JavaScript 中亦可为你提供自动补全功能！

⚙️ 开发工具支持

不管是 Vue 2 还是 Vue 3，支持 Vue devtools 钩子的 Pinia 都能给你更好的开发体验。

🔌 可扩展性

可通过事务、同步本地存储等方式扩展 Pinia，以响应 store 的变更以及 action。

🏗 模块化设计

可构建多个 Store 并允许你的打包工具自动拆分它们。

📦 极致轻量化

Pinia 大小只有 1kb 左右，你甚至可能忘记它的存在！

Gold Sponsors

Silver Sponsors

成为赞助者！

---

