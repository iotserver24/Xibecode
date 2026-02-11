---
description: Skill learned from https://vuejs.org/guide — 25 pages scraped
tags: learned, docs, vue
source: https://vuejs.org/guide
---

# vue

> Learned from [https://vuejs.org/guide](https://vuejs.org/guide) — 25 pages

## Introduction | Vue.js

> Source: https://vuejs.org/guide

Introduction | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Introduction 
​

You are reading the documentation for Vue 3!

Vue 2 support has ended on 
Dec 31, 2023
. Learn more about 
Vue 2 EOL
.

Upgrading from Vue 2? Check out the 
Migration Guide
.

Learn Vue with video tutorials on 
VueMastery.com

What is Vue? 
​

Vue (pronounced /vjuː/, like 
view
) is a JavaScript framework for building user interfaces. It builds on top of standard HTML, CSS, and JavaScript and provides a declarative, component-based programming model that helps you efficiently develop user interfaces of any complexity.

Here is a minimal example:

js

import

 { createApp } 

from

 'vue'

createApp

({

  data

() {

    return

 {

      count: 

0

    }

  }

}).

mount

(

'#app'

)

js

import

 { createApp, ref } 

from

 'vue'

createApp

({

  setup

() {

    return

 {

      count: 

ref

(

0

)

    }

  }

}).

mount

(

'#app'

)

template

<

div

 id

=

"app"

>

  <

button

 @

click

=

"

count

++

"

>

    Count is: {{ count }}

  </

button

>

</

div

>

Result

 Count is: 0

The above example demonstrates the two core features of Vue:

Declarative Rendering
: Vue extends standard HTML with a template syntax that allows us to declaratively describe HTML output based on JavaScript state.

Reactivity
: Vue automatically tracks JavaScript state changes and efficiently updates the DOM when changes happen.

You may already have questions - don't worry. We will cover every little detail in the rest of the documentation. For now, please read along so you can have a high-level understanding of what Vue offers.

Prerequisites

The rest of the documentation assumes basic familiarity with HTML, CSS, and JavaScript. If you are totally new to frontend development, it might not be the best idea to jump right into a framework as your first step - grasp the basics and then come back! You can check your knowledge level with these overviews for 
JavaScript
, 
HTML
 and 
CSS
 if needed. Prior experience with other frameworks helps, but is not required.

The Progressive Framework 
​

Vue is a framework and ecosystem that covers most of the common features needed in frontend development. But the web is extremely diverse - the things we build on the web may vary drastically in form and scale. With that in mind, Vue is designed to be flexible and incrementally adoptable. Depending on your use case, Vue can be used in different ways:

Enhancing static HTML without a build step

Embedding as Web Components on any page

Single-Page Application (SPA)

Fullstack / Server-Side Rendering (SSR)

Jamstack / Static Site Generation (SSG)

Targeting desktop, mobile, WebGL, and even the terminal

If you find these concepts intimidating, don't worry! The tutorial and guide only require basic HTML and JavaScript knowledge, and you should be able to follow along without being an expert in any of these.

If you are an experienced developer interested in how to best integrate Vue into your stack, or you are curious about what these terms mean, we discuss them in more detail in 
Ways of Using Vue
.

Despite the flexibility, the core knowledge about how Vue works is shared across all these use cases. Even if you are just a beginner now, the knowledge gained along the way will stay useful as you grow to tackle more ambitious goals in the future. If you are a veteran, you can pick the optimal way to leverage Vue based on the problems you are trying to solve, while retaining the same productivity. This is why we call Vue "The Progressive Framework": it's a framework that can grow with you and adapt to your needs.

Single-File Components 
​

In most build-tool-enabled Vue projects, we author Vue components using an HTML-l

...(truncated)

---

## Introduction | Vue.js

> Source: https://vuejs.org/guide/introduction

Introduction | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Introduction 
​

You are reading the documentation for Vue 3!

Vue 2 support has ended on 
Dec 31, 2023
. Learn more about 
Vue 2 EOL
.

Upgrading from Vue 2? Check out the 
Migration Guide
.

Learn Vue with video tutorials on 
VueMastery.com

What is Vue? 
​

Vue (pronounced /vjuː/, like 
view
) is a JavaScript framework for building user interfaces. It builds on top of standard HTML, CSS, and JavaScript and provides a declarative, component-based programming model that helps you efficiently develop user interfaces of any complexity.

Here is a minimal example:

js

import

 { createApp } 

from

 'vue'

createApp

({

  data

() {

    return

 {

      count: 

0

    }

  }

}).

mount

(

'#app'

)

js

import

 { createApp, ref } 

from

 'vue'

createApp

({

  setup

() {

    return

 {

      count: 

ref

(

0

)

    }

  }

}).

mount

(

'#app'

)

template

<

div

 id

=

"app"

>

  <

button

 @

click

=

"

count

++

"

>

    Count is: {{ count }}

  </

button

>

</

div

>

Result

 Count is: 0

The above example demonstrates the two core features of Vue:

Declarative Rendering
: Vue extends standard HTML with a template syntax that allows us to declaratively describe HTML output based on JavaScript state.

Reactivity
: Vue automatically tracks JavaScript state changes and efficiently updates the DOM when changes happen.

You may already have questions - don't worry. We will cover every little detail in the rest of the documentation. For now, please read along so you can have a high-level understanding of what Vue offers.

Prerequisites

The rest of the documentation assumes basic familiarity with HTML, CSS, and JavaScript. If you are totally new to frontend development, it might not be the best idea to jump right into a framework as your first step - grasp the basics and then come back! You can check your knowledge level with these overviews for 
JavaScript
, 
HTML
 and 
CSS
 if needed. Prior experience with other frameworks helps, but is not required.

The Progressive Framework 
​

Vue is a framework and ecosystem that covers most of the common features needed in frontend development. But the web is extremely diverse - the things we build on the web may vary drastically in form and scale. With that in mind, Vue is designed to be flexible and incrementally adoptable. Depending on your use case, Vue can be used in different ways:

Enhancing static HTML without a build step

Embedding as Web Components on any page

Single-Page Application (SPA)

Fullstack / Server-Side Rendering (SSR)

Jamstack / Static Site Generation (SSG)

Targeting desktop, mobile, WebGL, and even the terminal

If you find these concepts intimidating, don't worry! The tutorial and guide only require basic HTML and JavaScript knowledge, and you should be able to follow along without being an expert in any of these.

If you are an experienced developer interested in how to best integrate Vue into your stack, or you are curious about what these terms mean, we discuss them in more detail in 
Ways of Using Vue
.

Despite the flexibility, the core knowledge about how Vue works is shared across all these use cases. Even if you are just a beginner now, the knowledge gained along the way will stay useful as you grow to tackle more ambitious goals in the future. If you are a veteran, you can pick the optimal way to leverage Vue based on the problems you are trying to solve, while retaining the same productivity. This is why we call Vue "The Progressive Framework": it's a framework that can grow with you and adapt to your needs.

Single-File Components 
​

In most build-tool-enabled Vue projects, we author Vue components using an HTML-l

...(truncated)

---

## Quick Start | Vue.js

> Source: https://vuejs.org/guide/quick-start

Quick Start | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Quick Start 
​

Try Vue Online 
​

To quickly get a taste of Vue, you can try it directly in our 
Playground
.

If you prefer a plain HTML setup without any build steps, you can use this 
JSFiddle
 as your starting point.

If you are already familiar with Node.js and the concept of build tools, you can also try a complete build setup right within your browser on 
StackBlitz
.

To get a walkthrough of the recommended setup, watch this interactive 
Scrimba
 tutorial that shows you how to run, edit, and deploy your first Vue app.

Creating a Vue Application 
​

Prerequisites

Familiarity with the command line

Install 
Node.js
 version 
^20.19.0 || >=22.12.0

In this section we will introduce how to scaffold a Vue 
Single Page Application
 on your local machine. The created project will be using a build setup based on 
Vite
 and allow us to use Vue 
Single-File Components
 (SFCs).

Make sure you have an up-to-date version of 
Node.js
 installed and your current working directory is the one where you intend to create a project. Run the following command in your command line (without the 
$
 sign):

npm

pnpm

yarn

bun

sh

$ 

npm

 create

 vue@latest

sh

$ 

pnpm

 create

 vue@latest

sh

# For Yarn (v1+)

$ 

yarn

 create

 vue

# For Yarn Modern (v2+)

$ 

yarn

 create

 vue@latest

  

# For Yarn ^v4.11

$ 

yarn

 dlx

 create-vue@latest

sh

$ 

bun

 create

 vue@latest

This command will install and execute 
create-vue
, the official Vue project scaffolding tool. You will be presented with prompts for several optional features such as TypeScript and testing support:

✔
 
Project name: 
… 
<

your-project-name

>

✔
 
Add TypeScript? 
… 
No
 / Yes

✔
 
Add JSX Support? 
… 
No
 / Yes

✔
 
Add Vue Router for Single Page Application development? 
… 
No
 / Yes

✔
 
Add Pinia for state management? 
… 
No
 / Yes

✔
 
Add Vitest for Unit testing? 
… 
No
 / Yes

✔
 
Add an End-to-End Testing Solution? 
… 
No
 / Cypress / Nightwatch / Playwright

✔
 
Add ESLint for code quality? 
… No / 
Yes

✔
 
Add Prettier for code formatting? 
… 
No
 / Yes

✔
 
Add Vue DevTools 7 extension for debugging? (experimental) 
… 
No
 / Yes

Scaffolding project in ./
<

your-project-name

>
...

Done.

If you are unsure about an option, simply choose 
No
 by hitting enter for now. Once the project is created, follow the instructions to install dependencies and start the dev server:

npm

pnpm

yarn

bun

sh

$ 

cd

 <your-project-name>

$ 

npm

 install

$ 

npm

 run

 dev

sh

$ 

cd

 <your-project-name>

$ 

pnpm

 install

$ 

pnpm

 run

 dev

sh

$ 

cd

 <your-project-name>

$ 

yarn

$ 

yarn

 dev

sh

$ 

cd

 <your-project-name>

$ 

bun

 install

$ 

bun

 run

 dev

You should now have your first Vue project running! Note that the example components in the generated project are written using the 
Composition API
 and 
<script setup>
, rather than the 
Options API
. Here are some additional tips:

The recommended IDE setup is 
Visual Studio Code
 + 
Vue - Official extension
. If you use other editors, check out the 
IDE support section
.

More tooling details, including integration with backend frameworks, are discussed in the 
Tooling Guide
.

To learn more about the underlying build tool Vite, check out the 
Vite docs
.

If you choose to use TypeScript, check out the 
TypeScript Usage Guide
.

When you are ready to ship your app to production, run the following:

npm

pnpm

yarn

bun

sh

$ 

npm

 run

 build

sh

$ 

pnpm

 run

 build

sh

$ 

yarn

 build

sh

$ 

bun

 run

 build

This will create a production-ready build of your app in the project's 
./dist
 directory. Check out the 
Production Deployment Guide
 to l

...(truncated)

---

## Tooling | Vue.js

> Source: https://vuejs.org/guide/scaling-up/tooling

Tooling | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Tooling 
​

Try It Online 
​

You don't need to install anything on your machine to try out Vue SFCs - there are online playgrounds that allow you to do so right in the browser:

Vue SFC Playground

Always deployed from latest commit

Designed for inspecting component compilation results

Vue + Vite on StackBlitz

IDE-like environment running actual Vite dev server in the browser

Closest to local setup

It is also recommended to use these online playgrounds to provide reproductions when reporting bugs.

Project Scaffolding 
​

Vite 
​

Vite
 is a lightweight and fast build tool with first-class Vue SFC support. It is created by Evan You, who is also the author of Vue!

To get started with Vite + Vue, simply run:

npm

pnpm

yarn

bun

sh

$ 

npm

 create

 vue@latest

sh

$ 

pnpm

 create

 vue@latest

sh

# For Yarn Modern (v2+)

$ 

yarn

 create

 vue@latest

  

# For Yarn ^v4.11

$ 

yarn

 dlx

 create-vue@latest

sh

$ 

bun

 create

 vue@latest

This command will install and execute 
create-vue
, the official Vue project scaffolding tool.

To learn more about Vite, check out the 
Vite docs
.

To configure Vue-specific behavior in a Vite project, for example passing options to the Vue compiler, check out the docs for 
@vitejs/plugin-vue
.

Both online playgrounds mentioned above also support downloading files as a Vite project.

Vue CLI 
​

Vue CLI
 is the official webpack-based toolchain for Vue. It is now in maintenance mode and we recommend starting new projects with Vite unless you rely on specific webpack-only features. Vite will provide superior developer experience in most cases.

For information on migrating from Vue CLI to Vite:

Vue CLI -> Vite Migration Guide from VueSchool.io

Tools / Plugins that help with auto migration

Note on In-Browser Template Compilation 
​

When using Vue without a build step, component templates are written either directly in the page's HTML or as inlined JavaScript strings. In such cases, Vue needs to ship the template compiler to the browser in order to perform on-the-fly template compilation. On the other hand, the compiler would be unnecessary if we pre-compile the templates with a build step. To reduce client bundle size, Vue provides 
different "builds"
 optimized for different use cases.

Build files that start with 
vue.runtime.*
 are 
runtime-only builds
: they do not include the compiler. When using these builds, all templates must be pre-compiled via a build step.

Build files that do not include 
.runtime
 are 
full builds
: they include the compiler and support compiling templates directly in the browser. However, they will increase the payload by ~14kb.

Our default tooling setups use the runtime-only build since all templates in SFCs are pre-compiled. If, for some reason, you need in-browser template compilation even with a build step, you can do so by configuring the build tool to alias 
vue
 to 
vue/dist/vue.esm-bundler.js
 instead.

If you are looking for a lighter-weight alternative for no-build-step usage, check out 
petite-vue
.

IDE Support 
​

The recommended IDE setup is 
VS Code
 + the 
Vue - Official extension
 (previously Volar). The extension provides syntax highlighting, TypeScript support, and intellisense for template expressions and component props.

TIP

Vue - Official replaces 
Vetur
, our previous official VS Code extension for Vue 2. If you have Vetur currently installed, make sure to disable it in Vue 3 projects.

WebStorm
 also provides great built-in support for Vue SFCs.

Other IDEs that support the 
Language Service Protocol
 (LSP) can also leverage Volar's core functionalities via LSP:

Sublime Text support via 
LSP-Volar
.

vim / Neo

...(truncated)

---

## Creating a Vue Application | Vue.js

> Source: https://vuejs.org/guide/essentials/application

Creating a Vue Application | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Creating a Vue Application 
​

The Application Instance 
​

Every Vue application starts by creating a new 
application instance
 with the 

createApp

 function:

js

import

 { createApp } 

from

 'vue'

const

 app

 =

 createApp

({

  /* root component options */

})

The Root Component 
​

The object we are passing into 
createApp
 is in fact a component. Every app requires a "root component" that can contain other components as its children.

If you are using Single-File Components, we typically import the root component from another file:

js

import

 { createApp } 

from

 'vue'

// import the root component App from a single-file component.

import

 App 

from

 './App.vue'

const

 app

 =

 createApp

(App)

While many examples in this guide only need a single component, most real applications are organized into a tree of nested, reusable components. For example, a Todo application's component tree might look like this:

App (root component)

├─ TodoList

│  └─ TodoItem

│     ├─ TodoDeleteButton

│     └─ TodoEditButton

└─ TodoFooter

   ├─ TodoClearButton

   └─ TodoStatistics

In later sections of the guide, we will discuss how to define and compose multiple components together. Before that, we will focus on what happens inside a single component.

Mounting the App 
​

An application instance won't render anything until its 
.mount()
 method is called. It expects a "container" argument, which can either be an actual DOM element or a selector string:

html

<

div

 id

=

"app"

></

div

>

js

app.

mount

(

'#app'

)

The content of the app's root component will be rendered inside the container element. The container element itself is not considered part of the app.

The 
.mount()
 method should always be called after all app configurations and asset registrations are done. Also note that its return value, unlike the asset registration methods, is the root component instance instead of the application instance.

In-DOM Root Component Template 
​

The template for the root component is usually part of the component itself, but it is also possible to provide the template separately by writing it directly inside the mount container:

html

<

div

 id

=

"app"

>

  <

button

 @click

=

"count++"

>{{ count }}</

button

>

</

div

>

js

import

 { createApp } 

from

 'vue'

const

 app

 =

 createApp

({

  data

() {

    return

 {

      count: 

0

    }

  }

})

app.

mount

(

'#app'

)

Vue will automatically use the container's 
innerHTML
 as the template if the root component does not already have a 
template
 option.

In-DOM templates are often used in applications that are 
using Vue without a build step
. They can also be used in conjunction with server-side frameworks, where the root template might be generated dynamically by the server.

App Configurations 
​

The application instance exposes a 
.config
 object that allows us to configure a few app-level options, for example, defining an app-level error handler that captures errors from all descendant components:

js

app.config.

errorHandler

 =

 (

err

) 

=>

 {

  /* handle error */

}

The application instance also provides a few methods for registering app-scoped assets. For example, registering a component:

js

app.

component

(

'TodoDeleteButton'

, TodoDeleteButton)

This makes the 
TodoDeleteButton
 available for use anywhere in our app. We will discuss registration for components and other types of assets in later sections of the guide. You can also browse the full list of application instance APIs in its 
API reference
.

Make sure to apply all app configurations before mounting the app!

Multip

...(truncated)

---

## Template Syntax | Vue.js

> Source: https://vuejs.org/guide/essentials/template-syntax

Template Syntax | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Template Syntax 
​

 Watch an interactive video lesson on Scrimba 

Vue uses an HTML-based template syntax that allows you to declaratively bind the rendered DOM to the underlying component instance's data. All Vue templates are syntactically valid HTML that can be parsed by spec-compliant browsers and HTML parsers.

Under the hood, Vue compiles the templates into highly-optimized JavaScript code. Combined with the reactivity system, Vue can intelligently figure out the minimal number of components to re-render and apply the minimal amount of DOM manipulations when the app state changes.

If you are familiar with Virtual DOM concepts and prefer the raw power of JavaScript, you can also 
directly write render functions
 instead of templates, with optional JSX support. However, do note that they do not enjoy the same level of compile-time optimizations as templates.

Text Interpolation 
​

The most basic form of data binding is text interpolation using the "Mustache" syntax (double curly braces):

template

<

span

>Message: {{ msg }}</

span

>

The mustache tag will be replaced with the value of the 
msg
 property 
from the corresponding component instance
. It will also be updated whenever the 
msg
 property changes.

Raw HTML 
​

The double mustaches interpret the data as plain text, not HTML. In order to output real HTML, you will need to use the 

v-html
 directive
:

template

<

p

>Using text interpolation: {{ rawHtml }}</

p

>

<

p

>Using v-html directive: <

span

 v-html

=

"

rawHtml

"

></

span

></

p

>

Using text interpolation: <span style="color: red">This should be red.</span>

Using v-html directive: 

This should be red.

Here we're encountering something new. The 
v-html
 attribute you're seeing is called a 
directive
. Directives are prefixed with 
v-
 to indicate that they are special attributes provided by Vue, and as you may have guessed, they apply special reactive behavior to the rendered DOM. Here, we're basically saying "keep this element's inner HTML up-to-date with the 
rawHtml
 property on the current active instance."

The contents of the 
span
 will be replaced with the value of the 
rawHtml
 property, interpreted as plain HTML - data bindings are ignored. Note that you cannot use 
v-html
 to compose template partials, because Vue is not a string-based templating engine. Instead, components are preferred as the fundamental unit for UI reuse and composition.

Security Warning

Dynamically rendering arbitrary HTML on your website can be very dangerous because it can easily lead to 
XSS vulnerabilities
. Only use 
v-html
 on trusted content and 
never
 on user-provided content.

Attribute Bindings 
​

Mustaches cannot be used inside HTML attributes. Instead, use a 

v-bind
 directive
:

template

<

div

 v-bind

:

id

=

"

dynamicId

"

></

div

>

The 
v-bind
 directive instructs Vue to keep the element's 
id
 attribute in sync with the component's 
dynamicId
 property. If the bound value is 
null
 or 
undefined
, then the attribute will be removed from the rendered element.

Shorthand 
​

Because 
v-bind
 is so commonly used, it has a dedicated shorthand syntax:

template

<

div

 :

id

=

"

dynamicId

"

></

div

>

Attributes that start with 
:
 may look a bit different from normal HTML, but it is in fact a valid character for attribute names and all Vue-supported browsers can parse it correctly. In addition, they do not appear in the final rendered markup. The shorthand syntax is optional, but you will likely appreciate it when you learn more about its usage later.

For the rest of the guide, we will be using the shorthand syntax in code examples, as that's the most 

...(truncated)

---

## Reactivity Fundamentals | Vue.js

> Source: https://vuejs.org/guide/essentials/reactivity-fundamentals

Reactivity Fundamentals | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Reactivity Fundamentals 
​

API Preference

This page and many other chapters later in the guide contain different content for the Options API and the Composition API. Your current preference is 
Options API

Composition API
. You can toggle between the API styles using the "API Preference" switches at the top of the left sidebar.

Declaring Reactive State 
​

With the Options API, we use the 
data
 option to declare reactive state of a component. The option value should be a function that returns an object. Vue will call the function when creating a new component instance, and wrap the returned object in its reactivity system. Any top-level properties of this object are proxied on the component instance (
this
 in methods and lifecycle hooks):

js

export

 default

 {

  data

() {

    return

 {

      count: 

1

    }

  },

  // `mounted` is a lifecycle hook which we will explain later

  mounted

() {

    // `this` refers to the component instance.

    console.

log

(

this

.count) 

// => 1

    // data can be mutated as well

    this

.count 

=

 2

  }

}

Try it in the Playground

These instance properties are only added when the instance is first created, so you need to ensure they are all present in the object returned by the 
data
 function. Where necessary, use 
null
, 
undefined
 or some other placeholder value for properties where the desired value isn't yet available.

It is possible to add a new property directly to 
this
 without including it in 
data
. However, properties added this way will not be able to trigger reactive updates.

Vue uses a 
$
 prefix when exposing its own built-in APIs via the component instance. It also reserves the prefix 
_
 for internal properties. You should avoid using names for top-level 
data
 properties that start with either of these characters.

Reactive Proxy vs. Original 
​

In Vue 3, data is made reactive by leveraging 
JavaScript Proxies
. Users coming from Vue 2 should be aware of the following edge case:

js

export

 default

 {

  data

() {

    return

 {

      someObject: {}

    }

  },

  mounted

() {

    const

 newObject

 =

 {}

    this

.someObject 

=

 newObject

    console.

log

(newObject 

===

 this

.someObject) 

// false

  }

}

When you access 
this.someObject
 after assigning it, the value is a reactive proxy of the original 
newObject
. 
Unlike in Vue 2, the original 
newObject
 is left intact and will not be made reactive: make sure to always access reactive state as a property of 
this
.

Declaring Reactive State 
​

ref()
 
​

In Composition API, the recommended way to declare reactive state is using the 

ref()

 function:

js

import

 { ref } 

from

 'vue'

const

 count

 =

 ref

(

0

)

ref()
 takes the argument and returns it wrapped within a ref object with a 
.value
 property:

js

const

 count

 =

 ref

(

0

)

console.

log

(count) 

// { value: 0 }

console.

log

(count.value) 

// 0

count.value

++

console.

log

(count.value) 

// 1

See also: 
Typing Refs
 

To access refs in a component's template, declare and return them from a component's 
setup()
 function:

js

import

 { ref } 

from

 'vue'

export

 default

 {

  // `setup` is a special hook dedicated for the Composition API.

  setup

() {

    const

 count

 =

 ref

(

0

)

    // expose the ref to the template

    return

 {

      count

    }

  }

}

template

<

div

>{{ count }}</

div

>

Notice that we did 
not
 need to append 
.value
 when using the ref in the template. For convenience, refs are automatically unwrapped when used inside templates (with a few 
caveats
).

You can also mutate a ref directly in event 

...(truncated)

---

## Computed Properties | Vue.js

> Source: https://vuejs.org/guide/essentials/computed

Computed Properties | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Computed Properties 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

Basic Example 
​

In-template expressions are very convenient, but they are meant for simple operations. Putting too much logic in your templates can make them bloated and hard to maintain. For example, if we have an object with a nested array:

js

export

 default

 {

  data

() {

    return

 {

      author: {

        name: 

'John Doe'

,

        books: [

          'Vue 2 - Advanced Guide'

,

          'Vue 3 - Basic Guide'

,

          'Vue 4 - The Mystery'

        ]

      }

    }

  }

}

js

const

 author

 =

 reactive

({

  name: 

'John Doe'

,

  books: [

    'Vue 2 - Advanced Guide'

,

    'Vue 3 - Basic Guide'

,

    'Vue 4 - The Mystery'

  ]

})

And we want to display different messages depending on if 
author
 already has some books or not:

template

<

p

>Has published books:</

p

>

<

span

>{{ author.books.length > 0 ? 'Yes' : 'No' }}</

span

>

At this point, the template is getting a bit cluttered. We have to look at it for a second before realizing that it performs a calculation depending on 
author.books
. More importantly, we probably don't want to repeat ourselves if we need to include this calculation in the template more than once.

That's why for complex logic that includes reactive data, it is recommended to use a 
computed property
. Here's the same example, refactored:

js

export

 default

 {

  data

() {

    return

 {

      author: {

        name: 

'John Doe'

,

        books: [

          'Vue 2 - Advanced Guide'

,

          'Vue 3 - Basic Guide'

,

          'Vue 4 - The Mystery'

        ]

      }

    }

  },

  computed: {

    // a computed getter

    publishedBooksMessage

() {

      // `this` points to the component instance

      return

 this

.author.books.

length

 >

 0

 ?

 'Yes'

 :

 'No'

    }

  }

}

template

<

p

>Has published books:</

p

>

<

span

>{{ publishedBooksMessage }}</

span

>

Try it in the Playground

Here we have declared a computed property 
publishedBooksMessage
.

Try to change the value of the 
books
 array in the application 
data
 and you will see how 
publishedBooksMessage
 is changing accordingly.

You can data-bind to computed properties in templates just like a normal property. Vue is aware that 
this.publishedBooksMessage
 depends on 
this.author.books
, so it will update any bindings that depend on 
this.publishedBooksMessage
 when 
this.author.books
 changes.

See also: 
Typing Computed Properties
 

vue

<

script

 setup

>

import

 { reactive, computed } 

from

 'vue'

const

 author

 =

 reactive

({

  name: 

'John Doe'

,

  books: [

    'Vue 2 - Advanced Guide'

,

    'Vue 3 - Basic Guide'

,

    'Vue 4 - The Mystery'

  ]

})

// a computed ref

const

 publishedBooksMessage

 =

 computed

(() 

=>

 {

  return

 author.books.

length

 >

 0

 ?

 'Yes'

 :

 'No'

})

</

script

>

<

template

>

  <

p

>Has published books:</

p

>

  <

span

>{{ publishedBooksMessage }}</

span

>

</

template

>

Try it in the Playground

Here we have declared a computed property 
publishedBooksMessage
. The 
computed()
 function expects to be passed a 
getter function
, and the returned value is a 
computed ref
. Similar to normal refs, you can access the computed result as 
publishedBooksMessage.value
. Computed refs are also auto-unwrapped in templates so you can reference them without 
.value
 in template expressions.

A computed property automatically tracks its reactive dependencies. Vue is aware that the computation of 
publishedBooksMessage
 depends on 
author.books
,

...(truncated)

---

## Class and Style Bindings | Vue.js

> Source: https://vuejs.org/guide/essentials/class-and-style

Class and Style Bindings | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Class and Style Bindings 
​

A common need for data binding is manipulating an element's class list and inline styles. Since 
class
 and 
style
 are both attributes, we can use 
v-bind
 to assign them a string value dynamically, much like with other attributes. However, trying to generate those values using string concatenation can be annoying and error-prone. For this reason, Vue provides special enhancements when 
v-bind
 is used with 
class
 and 
style
. In addition to strings, the expressions can also evaluate to objects or arrays.

Binding HTML Classes 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

Binding to Objects 
​

We can pass an object to 
:class
 (short for 
v-bind:class
) to dynamically toggle classes:

template

<

div

 :

class

=

"

{ active: isActive }

"

></

div

>

The above syntax means the presence of the 
active
 class will be determined by the 
truthiness
 of the data property 
isActive
.

You can have multiple classes toggled by having more fields in the object. In addition, the 
:class
 directive can also co-exist with the plain 
class
 attribute. So given the following state:

js

const

 isActive

 =

 ref

(

true

)

const

 hasError

 =

 ref

(

false

)

js

data

() {

  return

 {

    isActive: 

true

,

    hasError: 

false

  }

}

And the following template:

template

<

div

  class

=

"static"

  :

class

=

"

{ active: isActive, 

'text-danger'

: hasError }

"

></

div

>

It will render:

template

<

div

 class

=

"static active"

></

div

>

When 
isActive
 or 
hasError
 changes, the class list will be updated accordingly. For example, if 
hasError
 becomes 
true
, the class list will become 
"static active text-danger"
.

The bound object doesn't have to be inline:

js

const

 classObject

 =

 reactive

({

  active: 

true

,

  'text-danger'

: 

false

})

js

data

() {

  return

 {

    classObject: {

      active: 

true

,

      'text-danger'

: 

false

    }

  }

}

template

<

div

 :

class

=

"

classObject

"

></

div

>

This will render:

template

<

div

 class

=

"active"

></

div

>

We can also bind to a 
computed property
 that returns an object. This is a common and powerful pattern:

js

const

 isActive

 =

 ref

(

true

)

const

 error

 =

 ref

(

null

)

const

 classObject

 =

 computed

(() 

=>

 ({

  active: isActive.value 

&&

 !

error.value,

  'text-danger'

: error.value 

&&

 error.value.type 

===

 'fatal'

}))

js

data

() {

  return

 {

    isActive: 

true

,

    error: 

null

  }

},

computed

: {

  classObject

() {

    return

 {

      active: 

this

.isActive 

&&

 !

this

.error,

      'text-danger'

: 

this

.error 

&&

 this

.error.type 

===

 'fatal'

    }

  }

}

template

<

div

 :

class

=

"

classObject

"

></

div

>

Binding to Arrays 
​

We can bind 
:class
 to an array to apply a list of classes:

js

const

 activeClass

 =

 ref

(

'active'

)

const

 errorClass

 =

 ref

(

'text-danger'

)

js

data

() {

  return

 {

    activeClass: 

'active'

,

    errorClass: 

'text-danger'

  }

}

template

<

div

 :

class

=

"

[activeClass, errorClass]

"

></

div

>

Which will render:

template

<

div

 class

=

"active text-danger"

></

div

>

If you would like to also toggle a class in the list conditionally, you can do it with a ternary expression:

template

<

div

 :

class

=

"

[isActive 

?

 activeClass 

:

 ''

, errorClass]

"

></

div

>

This will always apply 
errorClass
, but 
activeClass
 will only be applied when 
isActive
 is truthy.

However, this can be a bit verbose if you 

...(truncated)

---

## Conditional Rendering | Vue.js

> Source: https://vuejs.org/guide/essentials/conditional

Conditional Rendering | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Conditional Rendering 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

v-if
 
​

The directive 
v-if
 is used to conditionally render a block. The block will only be rendered if the directive's expression returns a truthy value.

template

<

h1

 v-if

=

"

awesome

"

>Vue is awesome!</

h1

>

v-else
 
​

You can use the 
v-else
 directive to indicate an "else block" for 
v-if
:

template

<

button

 @

click

=

"

awesome 

=

 !

awesome

"

>Toggle</

button

>

<

h1

 v-if

=

"

awesome

"

>Vue is awesome!</

h1

>

<

h1

 v-else

>Oh no 😢</

h1

>

Toggle

Vue is awesome!

Try it in the Playground

Try it in the Playground

A 
v-else
 element must immediately follow a 
v-if
 or a 
v-else-if
 element - otherwise it will not be recognized.

v-else-if
 
​

The 
v-else-if
, as the name suggests, serves as an "else if block" for 
v-if
. It can also be chained multiple times:

template

<

div

 v-if

=

"

type 

===

 'A'"

>

  A

</

div

>

<

div

 v-else-if

=

"

type 

===

 'B'"

>

  B

</

div

>

<

div

 v-else-if

=

"

type 

===

 'C'"

>

  C

</

div

>

<

div

 v-else

>

  Not A/B/C

</

div

>

Similar to 
v-else
, a 
v-else-if
 element must immediately follow a 
v-if
 or a 
v-else-if
 element.

v-if
 on 
<template>
 
​

Because 
v-if
 is a directive, it has to be attached to a single element. But what if we want to toggle more than one element? In this case we can use 
v-if
 on a 
<template>
 element, which serves as an invisible wrapper. The final rendered result will not include the 
<template>
 element.

template

<

template

 v-if

=

"

ok

"

>

  <

h1

>Title</

h1

>

  <

p

>Paragraph 1</

p

>

  <

p

>Paragraph 2</

p

>

</

template

>

v-else
 and 
v-else-if
 can also be used on 
<template>
.

v-show
 
​

Another option for conditionally displaying an element is the 
v-show
 directive. The usage is largely the same:

template

<

h1

 v-show

=

"

ok

"

>Hello!</

h1

>

The difference is that an element with 
v-show
 will always be rendered and remain in the DOM; 
v-show
 only toggles the 
display
 CSS property of the element.

v-show
 doesn't support the 
<template>
 element, nor does it work with 
v-else
.

v-if
 vs. 
v-show
 
​

v-if
 is "real" conditional rendering because it ensures that event listeners and child components inside the conditional block are properly destroyed and re-created during toggles.

v-if
 is also 
lazy
: if the condition is false on initial render, it will not do anything - the conditional block won't be rendered until the condition becomes true for the first time.

In comparison, 
v-show
 is much simpler - the element is always rendered regardless of initial condition, with CSS-based toggling.

Generally speaking, 
v-if
 has higher toggle costs while 
v-show
 has higher initial render costs. So prefer 
v-show
 if you need to toggle something very often, and prefer 
v-if
 if the condition is unlikely to change at runtime.

v-if
 with 
v-for
 
​

When 
v-if
 and 
v-for
 are both used on the same element, 
v-if
 will be evaluated first. See the 
list rendering guide
 for details.

Note

It's 
not
 recommended to use 
v-if
 and 
v-for
 on the same element due to implicit precedence. Refer to 
list rendering guide
 for details.

Edit this page on GitHub

Conditional Rendering has loaded

---

## List Rendering | Vue.js

> Source: https://vuejs.org/guide/essentials/list

List Rendering | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

List Rendering 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

v-for
 
​

We can use the 
v-for
 directive to render a list of items based on an array. The 
v-for
 directive requires a special syntax in the form of 
item in items
, where 
items
 is the source data array and 
item
 is an 
alias
 for the array element being iterated on:

js

const

 items

 =

 ref

([{ message: 

'Foo'

 }, { message: 

'Bar'

 }])

js

data

() {

  return

 {

    items: [{ message: 

'Foo'

 }, { message: 

'Bar'

 }]

  }

}

template

<

li

 v-for

=

"

item 

in

 items

"

>

  {{ item.message }}

</

li

>

Inside the 
v-for
 scope, template expressions have access to all parent scope properties. In addition, 
v-for
 also supports an optional second alias for the index of the current item:

js

const

 parentMessage

 =

 ref

(

'Parent'

)

const

 items

 =

 ref

([{ message: 

'Foo'

 }, { message: 

'Bar'

 }])

js

data

() {

  return

 {

    parentMessage: 

'Parent'

,

    items: [{ message: 

'Foo'

 }, { message: 

'Bar'

 }]

  }

}

template

<

li

 v-for

=

"

(item, index) 

in

 items

"

>

  {{ parentMessage }} - {{ index }} - {{ item.message }}

</

li

>

Parent - 0 - Foo

Parent - 1 - Bar

Try it in the Playground

Try it in the Playground

The variable scoping of 
v-for
 is similar to the following JavaScript:

js

const

 parentMessage

 =

 'Parent'

const

 items

 =

 [

  /* ... */

]

items.

forEach

((

item

, 

index

) 

=>

 {

  // has access to outer scope `parentMessage`

  // but `item` and `index` are only available in here

  console.

log

(parentMessage, item.message, index)

})

Notice how the 
v-for
 value matches the function signature of the 
forEach
 callback. In fact, you can use destructuring on the 
v-for
 item alias similar to destructuring function arguments:

template

<

li

 v-for

=

"

{ message } 

in

 items

"

>

  {{ message }}

</

li

>

<!-- with index alias -->

<

li

 v-for

=

"

({ message }, index) 

in

 items

"

>

  {{ message }} {{ index }}

</

li

>

For nested 
v-for
, scoping also works similar to nested functions. Each 
v-for
 scope has access to parent scopes:

template

<

li

 v-for

=

"

item 

in

 items

"

>

  <

span

 v-for

=

"

childItem 

in

 item.children

"

>

    {{ item.message }} {{ childItem }}

  </

span

>

</

li

>

You can also use 
of
 as the delimiter instead of 
in
, so that it is closer to JavaScript's syntax for iterators:

template

<

div

 v-for

=

"

item 

of

 items

"

></

div

>

v-for
 with an Object 
​

You can also use 
v-for
 to iterate through the properties of an object. The iteration order will be based on the result of calling 
Object.values()
 on the object:

js

const

 myObject

 =

 reactive

({

  title: 

'How to do lists in Vue'

,

  author: 

'Jane Doe'

,

  publishedAt: 

'2016-04-10'

})

js

data

() {

  return

 {

    myObject: {

      title: 

'How to do lists in Vue'

,

      author: 

'Jane Doe'

,

      publishedAt: 

'2016-04-10'

    }

  }

}

template

<

ul

>

  <

li

 v-for

=

"

value 

in

 myObject

"

>

    {{ value }}

  </

li

>

</

ul

>

You can also provide a second alias for the property's name (a.k.a. key):

template

<

li

 v-for

=

"

(value, key) 

in

 myObject

"

>

  {{ key }}: {{ value }}

</

li

>

And another for the index:

template

<

li

 v-for

=

"

(value, key, index) 

in

 myObject

"

>

  {{ index }}. {{ key }}: {{ value }}

</

li

>

Try it in the Playground

Try it in the Playground

v-for
 with a Range 
​

v-for
 can also take an integer. In this case it will repeat the template t

...(truncated)

---

## Event Handling | Vue.js

> Source: https://vuejs.org/guide/essentials/event-handling

Event Handling | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Event Handling 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

Listening to Events 
​

We can use the 
v-on
 directive, which we typically shorten to the 
@
 symbol, to listen to DOM events and run some JavaScript when they're triggered. The usage would be 
v-on:click="handler"
 or with the shortcut, 
@click="handler"
.

The handler value can be one of the following:

Inline handlers:
 Inline JavaScript to be executed when the event is triggered (similar to the native 
onclick
 attribute).

Method handlers:
 A property name or path that points to a method defined on the component.

Inline Handlers 
​

Inline handlers are typically used in simple cases, for example:

js

const

 count

 =

 ref

(

0

)

js

data

() {

  return

 {

    count: 

0

  }

}

template

<

button

 @

click

=

"

count

++

"

>Add 1</

button

>

<

p

>Count is: {{ count }}</

p

>

Try it in the Playground

Try it in the Playground

Method Handlers 
​

The logic for many event handlers will be more complex though, and likely isn't feasible with inline handlers. That's why 
v-on
 can also accept the name or path of a component method you'd like to call.

For example:

js

const

 name

 =

 ref

(

'Vue.js'

)

function

 greet

(

event

) {

  alert

(

`Hello ${

name

.

value

}!`

)

  // `event` is the native DOM event

  if

 (event) {

    alert

(event.target.tagName)

  }

}

js

data

() {

  return

 {

    name: 

'Vue.js'

  }

},

methods

: {

  greet

(event) {

    // `this` inside methods points to the current active instance

    alert

(

`Hello ${

this

.

name

}!`

)

    // `event` is the native DOM event

    if

 (event) {

      alert

(event.target.tagName)

    }

  }

}

template

<!-- `greet` is the name of the method defined above -->

<

button

 @

click

=

"

greet

"

>Greet</

button

>

Try it in the Playground

Try it in the Playground

A method handler automatically receives the native DOM Event object that triggers it - in the example above, we are able to access the element dispatching the event via 
event.target
.

See also: 
Typing Event Handlers
 

See also: 
Typing Event Handlers
 

Method vs. Inline Detection 
​

The template compiler detects method handlers by checking whether the 
v-on
 value string is a valid JavaScript identifier or property access path. For example, 
foo
, 
foo.bar
 and 
foo['bar']
 are treated as method handlers, while 
foo()
 and 
count++
 are treated as inline handlers.

Calling Methods in Inline Handlers 
​

Instead of binding directly to a method name, we can also call methods in an inline handler. This allows us to pass the method custom arguments instead of the native event:

js

function

 say

(

message

) {

  alert

(message)

}

js

methods

: {

  say

(message) {

    alert

(message)

  }

}

template

<

button

 @

click

=

"

say

(

'hello'

)

"

>Say hello</

button

>

<

button

 @

click

=

"

say

(

'bye'

)

"

>Say bye</

button

>

Try it in the Playground

Try it in the Playground

Accessing Event Argument in Inline Handlers 
​

Sometimes we also need to access the original DOM event in an inline handler. You can pass it into a method using the special 
$event
 variable, or use an inline arrow function:

template

<!-- using $event special variable -->

<

button

 @

click

=

"

warn

(

'Form cannot be submitted yet.'

, $event)

"

>

  Submit

</

button

>

<!-- using inline arrow function -->

<

button

 @

click

=

"

(

event

) 

=>

 warn

(

'Form cannot be submitted yet.'

, event)

"

>

  Submit

</

button

>

js

function

 warn

(

message

, 

event

) {

  // now we have a

...(truncated)

---

## Form Input Bindings | Vue.js

> Source: https://vuejs.org/guide/essentials/forms

Form Input Bindings | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Form Input Bindings 
​

Watch a free video lesson on Vue School

Watch a free video lesson on Vue School

When dealing with forms on the frontend, we often need to sync the state of form input elements with corresponding state in JavaScript. It can be cumbersome to manually wire up value bindings and change event listeners:

template

<

input

  :

value

=

"

text

"

  @

input

=

"

event

 =>

 text 

=

 event.target.value

"

>

The 
v-model
 directive helps us simplify the above to:

template

<

input

 v-model

=

"

text

"

>

In addition, 
v-model
 can be used on inputs of different types, 
<textarea>
, and 
<select>
 elements. It automatically expands to different DOM property and event pairs based on the element it is used on:

<input>
 with text types and 
<textarea>
 elements use 
value
 property and 
input
 event;

<input type="checkbox">
 and 
<input type="radio">
 use 
checked
 property and 
change
 event;

<select>
 uses 
value
 as a prop and 
change
 as an event.

Note

v-model
 will ignore the initial 
value
, 
checked
 or 
selected
 attributes found on any form elements. It will always treat the current bound JavaScript state as the source of truth. You should declare the initial value on the JavaScript side, using 
the 

data

 option

reactivity APIs

.

Basic Usage 
​

Text 
​

template

<

p

>Message is: {{ message }}</

p

>

<

input

 v-model

=

"

message

"

 placeholder

=

"edit me"

 />

Message is: 

Try it in the Playground

Try it in the Playground

Note

For languages that require an 
IME
 (Chinese, Japanese, Korean, etc.), you'll notice that 
v-model
 doesn't get updated during IME composition. If you want to respond to these updates as well, use your own 
input
 event listener and 
value
 binding instead of using 
v-model
.

Multiline Text 
​

template

<

span

>Multiline message is:</

span

>

<

p

 style

=

"white-space: pre-line;"

>{{ message }}</

p

>

<

textarea

 v-model

=

"

message

"

 placeholder

=

"add multiple lines"

></

textarea

>

Multiline message is:

Try it in the Playground

Try it in the Playground

Note that interpolation inside 
<textarea>
 won't work. Use 
v-model
 instead.

template

<!-- bad -->

<

textarea

>{{ text }}</

textarea

>

<!-- good -->

<

textarea

 v-model

=

"

text

"

></

textarea

>

Checkbox 
​

Single checkbox, boolean value:

template

<

input

 type

=

"checkbox"

 id

=

"checkbox"

 v-model

=

"

checked

"

 />

<

label

 for

=

"checkbox"

>{{ checked }}</

label

>

false

Try it in the Playground

Try it in the Playground

We can also bind multiple checkboxes to the same array or 
Set
 value:

js

const

 checkedNames

 =

 ref

([])

js

export

 default

 {

  data

() {

    return

 {

      checkedNames: []

    }

  }

}

template

<

div

>Checked names: {{ checkedNames }}</

div

>

<

input

 type

=

"checkbox"

 id

=

"jack"

 value

=

"Jack"

 v-model

=

"

checkedNames

"

 />

<

label

 for

=

"jack"

>Jack</

label

>

<

input

 type

=

"checkbox"

 id

=

"john"

 value

=

"John"

 v-model

=

"

checkedNames

"

 />

<

label

 for

=

"john"

>John</

label

>

<

input

 type

=

"checkbox"

 id

=

"mike"

 value

=

"Mike"

 v-model

=

"

checkedNames

"

 />

<

label

 for

=

"mike"

>Mike</

label

>

Checked names: []

Jack

John

Mike

In this case, the 
checkedNames
 array will always contain the values from the currently checked boxes.

Try it in the Playground

Try it in the Playground

Radio 
​

template

<

div

>Picked: {{ picked }}</

div

>

<

input

 type

=

"radio"

 id

=

"one"

 value

=

"One"

 v-model

=

"

picked

"

 />

<

label

 for



...(truncated)

---

## Watchers | Vue.js

> Source: https://vuejs.org/guide/essentials/watchers

Watchers | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Watchers 
​

Basic Example 
​

Computed properties allow us to declaratively compute derived values. However, there are cases where we need to perform "side effects" in reaction to state changes - for example, mutating the DOM, or changing another piece of state based on the result of an async operation.

With the Options API, we can use the 

watch
 option
 to trigger a function whenever a reactive property changes:

js

export

 default

 {

  data

() {

    return

 {

      question: 

''

,

      answer: 

'Questions usually contain a question mark. ;-)'

,

      loading: 

false

    }

  },

  watch: {

    // whenever question changes, this function will run

    question

(

newQuestion

, 

oldQuestion

) {

      if

 (newQuestion.

includes

(

'?'

)) {

        this

.

getAnswer

()

      }

    }

  },

  methods: {

    async

 getAnswer

() {

      this

.loading 

=

 true

      this

.answer 

=

 'Thinking...'

      try

 {

        const

 res

 =

 await

 fetch

(

'https://yesno.wtf/api'

)

        this

.answer 

=

 (

await

 res.

json

()).answer

      } 

catch

 (error) {

        this

.answer 

=

 'Error! Could not reach the API. '

 +

 error

      } 

finally

 {

        this

.loading 

=

 false

      }

    }

  }

}

template

<

p

>

  Ask a yes/no question:

  <

input

 v-model

=

"

question

"

 :

disabled

=

"

loading

"

 />

</

p

>

<

p

>{{ answer }}</

p

>

Try it in the Playground

The 
watch
 option also supports a dot-delimited path as the key:

js

export

 default

 {

  watch: {

    // Note: only simple paths. Expressions are not supported.

    'some.nested.key'

(

newValue

) {

      // ...

    }

  }

}

With Composition API, we can use the 

watch
 function
 to trigger a callback whenever a piece of reactive state changes:

vue

<

script

 setup

>

import

 { ref, watch } 

from

 'vue'

const

 question

 =

 ref

(

''

)

const

 answer

 =

 ref

(

'Questions usually contain a question mark. ;-)'

)

const

 loading

 =

 ref

(

false

)

// watch works directly on a ref

watch

(question, 

async

 (

newQuestion

, 

oldQuestion

) 

=>

 {

  if

 (newQuestion.

includes

(

'?'

)) {

    loading.value 

=

 true

    answer.value 

=

 'Thinking...'

    try

 {

      const

 res

 =

 await

 fetch

(

'https://yesno.wtf/api'

)

      answer.value 

=

 (

await

 res.

json

()).answer

    } 

catch

 (error) {

      answer.value 

=

 'Error! Could not reach the API. '

 +

 error

    } 

finally

 {

      loading.value 

=

 false

    }

  }

})

</

script

>

<

template

>

  <

p

>

    Ask a yes/no question:

    <

input

 v-model

=

"question"

 :disabled

=

"loading"

 />

  </

p

>

  <

p

>{{ answer }}</

p

>

</

template

>

Try it in the Playground

Watch Source Types 
​

watch
's first argument can be different types of reactive "sources": it can be a ref (including computed refs), a reactive object, a 
getter function
, or an array of multiple sources:

js

const

 x

 =

 ref

(

0

)

const

 y

 =

 ref

(

0

)

// single ref

watch

(x, (

newX

) 

=>

 {

  console.

log

(

`x is ${

newX

}`

)

})

// getter

watch

(

  () 

=>

 x.value 

+

 y.value,

  (

sum

) 

=>

 {

    console.

log

(

`sum of x + y is: ${

sum

}`

)

  }

)

// array of multiple sources

watch

([x, () 

=>

 y.value], ([

newX

, 

newY

]) 

=>

 {

  console.

log

(

`x is ${

newX

} and y is ${

newY

}`

)

})

Do note that you can't watch a property of a reactive object like this:

js

const

 obj

 =

 reactive

({ count: 

0

 })

// this won't work because we are passing a number to watch()

wa

...(truncated)

---

## Template Refs | Vue.js

> Source: https://vuejs.org/guide/essentials/template-refs

Template Refs | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Template Refs 
​

While Vue's declarative rendering model abstracts away most of the direct DOM operations for you, there may still be cases where we need direct access to the underlying DOM elements. To achieve this, we can use the special 
ref
 attribute:

template

<

input

 ref

=

"input"

>

ref
 is a special attribute, similar to the 
key
 attribute discussed in the 
v-for
 chapter. It allows us to obtain a direct reference to a specific DOM element or child component instance after it's mounted. This may be useful when you want to, for example, programmatically focus an input on component mount, or initialize a 3rd party library on an element.

Accessing the Refs 
​

To obtain the reference with Composition API, we can use the 

useTemplateRef()

 

 helper:

vue

<

script

 setup

>

import

 { useTemplateRef, onMounted } 

from

 'vue'

// the first argument must match the ref value in the template

const

 input

 =

 useTemplateRef

(

'my-input'

)

onMounted

(() 

=>

 {

  input.value.

focus

()

})

</

script

>

<

template

>

  <

input

 ref

=

"my-input"

 />

</

template

>

When using TypeScript, Vue's IDE support and 
vue-tsc
 will automatically infer the type of 
input.value
 based on what element or component the matching 
ref
 attribute is used on.

Usage before 3.5

In versions before 3.5 where 
useTemplateRef()
 was not introduced, we need to declare a ref with a name that matches the template ref attribute's value:

vue

<

script

 setup

>

import

 { ref, onMounted } 

from

 'vue'

// declare a ref to hold the element reference

// the name must match template ref value

const

 input

 =

 ref

(

null

)

onMounted

(() 

=>

 {

  input.value.

focus

()

})

</

script

>

<

template

>

  <

input

 ref

=

"input"

 />

</

template

>

If not using 
<script setup>
, make sure to also return the ref from 
setup()
:

js

export

 default

 {

  setup

() {

    const

 input

 =

 ref

(

null

)

    // ...

    return

 {

      input

    }

  }

}

The resulting ref is exposed on 
this.$refs
:

vue

<

script

>

export

 default

 {

  mounted

() {

    this

.$refs.input.

focus

()

  }

}

</

script

>

<

template

>

  <

input

 ref

=

"input"

 />

</

template

>

Note that you can only access the ref 
after the component is mounted.
 If you try to access 

$refs.input

input

 in a template expression, it will be 

undefined

null

 on the first render. This is because the element doesn't exist until after the first render!

If you are trying to watch the changes of a template ref, make sure to account for the case where the ref has 
null
 value:

js

watchEffect

(() 

=>

 {

  if

 (input.value) {

    input.value.

focus

()

  } 

else

 {

    // not mounted yet, or the element was unmounted (e.g. by v-if)

  }

})

See also: 
Typing Template Refs
 

Ref on Component 
​

This section assumes knowledge of 
Components
. Feel free to skip it and come back later.

ref
 can also be used on a child component. In this case the reference will be that of a component instance:

vue

<

script

 setup

>

import

 { useTemplateRef, onMounted } 

from

 'vue'

import

 Child 

from

 './Child.vue'

const

 childRef

 =

 useTemplateRef

(

'child'

)

onMounted

(() 

=>

 {

  // childRef.value will hold an instance of <Child />

})

</

script

>

<

template

>

  <

Child

 ref

=

"child"

 />

</

template

>

Usage before 3.5

vue

<

script

 setup

>

import

 { ref, onMounted } 

from

 'vue'

import

 Child 

from

 './Child.vue'

const

 child

 =

 ref

(

null

)

onMounted

(() 

=>

 {

  // child.value will hold an instance of <Child />

})

</


...(truncated)

---

## Components Basics | Vue.js

> Source: https://vuejs.org/guide/essentials/component-basics

Components Basics | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Components Basics 
​

 Watch an interactive video lesson on Scrimba 

Components allow us to split the UI into independent and reusable pieces, and think about each piece in isolation. It's common for an app to be organized into a tree of nested components:

This is very similar to how we nest native HTML elements, but Vue implements its own component model that allows us to encapsulate custom content and logic in each component. Vue also plays nicely with native Web Components. If you are curious about the relationship between Vue Components and native Web Components, 
read more here
.

Defining a Component 
​

When using a build step, we typically define each Vue component in a dedicated file using the 
.vue
 extension - known as a 
Single-File Component
 (SFC for short):

vue

<

script

>

export

 default

 {

  data

() {

    return

 {

      count: 

0

    }

  }

}

</

script

>

<

template

>

  <

button

 @click

=

"count++"

>You clicked me {{ count }} times.</

button

>

</

template

>

vue

<

script

 setup

>

import

 { ref } 

from

 'vue'

const

 count

 =

 ref

(

0

)

</

script

>

<

template

>

  <

button

 @click

=

"count++"

>You clicked me {{ count }} times.</

button

>

</

template

>

When not using a build step, a Vue component can be defined as a plain JavaScript object containing Vue-specific options:

js

export

 default

 {

  data

() {

    return

 {

      count: 

0

    }

  },

  template: 

`

    <button @click="count++">

      You clicked me {{ count }} times.

    </button>`

}

js

import

 { ref } 

from

 'vue'

export

 default

 {

  setup

() {

    const

 count

 =

 ref

(

0

)

    return

 { count }

  },

  template: 

`

    <button @click="count++">

      You clicked me {{ count }} times.

    </button>`

  // Can also target an in-DOM template:

  // template: '#my-template-element'

}

The template is inlined as a JavaScript string here, which Vue will compile on the fly. You can also use an ID selector pointing to an element (usually native 
<template>
 elements) - Vue will use its content as the template source.

The example above defines a single component and exports it as the default export of a 
.js
 file, but you can use named exports to export multiple components from the same file.

Using a Component 
​

TIP

We will be using SFC syntax for the rest of this guide - the concepts around components are the same regardless of whether you are using a build step or not. The 
Examples
 section shows component usage in both scenarios.

To use a child component, we need to import it in the parent component. Assuming we placed our counter component inside a file called 
ButtonCounter.vue
, the component will be exposed as the file's default export:

vue

<

script

>

import

 ButtonCounter 

from

 './ButtonCounter.vue'

export

 default

 {

  components: {

    ButtonCounter

  }

}

</

script

>

<

template

>

  <

h1

>Here is a child component!</

h1

>

  <

ButtonCounter

 />

</

template

>

To expose the imported component to our template, we need to 
register
 it with the 
components
 option. The component will then be available as a tag using the key it is registered under.

vue

<

script

 setup

>

import

 ButtonCounter 

from

 './ButtonCounter.vue'

</

script

>

<

template

>

  <

h1

>Here is a child component!</

h1

>

  <

ButtonCounter

 />

</

template

>

With 
<script setup>
, imported components are automatically made available to the template.

It's also possible to globally register a component, making it available to all components in a given app without having to import it. The pros and cons of g

...(truncated)

---

## Lifecycle Hooks | Vue.js

> Source: https://vuejs.org/guide/essentials/lifecycle

Lifecycle Hooks | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Lifecycle Hooks 
​

Each Vue component instance goes through a series of initialization steps when it's created - for example, it needs to set up data observation, compile the template, mount the instance to the DOM, and update the DOM when data changes. Along the way, it also runs functions called lifecycle hooks, giving users the opportunity to add their own code at specific stages.

Registering Lifecycle Hooks 
​

For example, the 

onMounted

mounted

 hook can be used to run code after the component has finished the initial rendering and created the DOM nodes:

vue

<

script

 setup

>

import

 { onMounted } 

from

 'vue'

onMounted

(() 

=>

 {

  console.

log

(

`the component is now mounted.`

)

})

</

script

>

js

export

 default

 {

  mounted

() {

    console.

log

(

`the component is now mounted.`

)

  }

}

There are also other hooks which will be called at different stages of the instance's lifecycle, with the most commonly used being 

onMounted

, 

onUpdated

, and 

onUnmounted

.

mounted

, 

updated

, and 

unmounted

.

All lifecycle hooks are called with their 
this
 context pointing to the current active instance invoking it. Note this means you should avoid using arrow functions when declaring lifecycle hooks, as you won't be able to access the component instance via 
this
 if you do so.

When calling 
onMounted
, Vue automatically associates the registered callback function with the current active component instance. This requires these hooks to be registered 
synchronously
 during component setup. For example, do not do this:

js

setTimeout

(() 

=>

 {

  onMounted

(() 

=>

 {

    // this won't work.

  })

}, 

100

)

Do note this doesn't mean that the call must be placed lexically inside 
setup()
 or 
<script setup>
. 
onMounted()
 can be called in an external function as long as the call stack is synchronous and originates from within 
setup()
.

Lifecycle Diagram 
​

Below is a diagram for the instance lifecycle. You don't need to fully understand everything going on right now, but as you learn and build more, it will be a useful reference.

Consult the 

Lifecycle Hooks API reference

Lifecycle Hooks API reference

 for details on all lifecycle hooks and their respective use cases.

Edit this page on GitHub

Lifecycle Hooks has loaded

---

## Component Registration | Vue.js

> Source: https://vuejs.org/guide/components/registration

Component Registration | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Component Registration 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Watch a free video lesson on Vue School

A Vue component needs to be "registered" so that Vue knows where to locate its implementation when it is encountered in a template. There are two ways to register components: global and local.

Global Registration 
​

We can make components available globally in the current 
Vue application
 using the 
.component()
 method:

js

import

 { createApp } 

from

 'vue'

const

 app

 =

 createApp

({})

app.

component

(

  // the registered name

  'MyComponent'

,

  // the implementation

  {

    /* ... */

  }

)

If using SFCs, you will be registering the imported 
.vue
 files:

js

import

 MyComponent 

from

 './App.vue'

app.

component

(

'MyComponent'

, MyComponent)

The 
.component()
 method can be chained:

js

app

  .

component

(

'ComponentA'

, ComponentA)

  .

component

(

'ComponentB'

, ComponentB)

  .

component

(

'ComponentC'

, ComponentC)

Globally registered components can be used in the template of any component within this application:

template

<!-- this will work in any component inside the app -->

<

ComponentA

/>

<

ComponentB

/>

<

ComponentC

/>

This even applies to all subcomponents, meaning all three of these components will also be available 
inside each other
.

Local Registration 
​

While convenient, global registration has a few drawbacks:

Global registration prevents build systems from removing unused components (a.k.a "tree-shaking"). If you globally register a component but end up not using it anywhere in your app, it will still be included in the final bundle.

Global registration makes dependency relationships less explicit in large applications. It makes it difficult to locate a child component's implementation from a parent component using it. This can affect long-term maintainability similar to using too many global variables.

Local registration scopes the availability of the registered components to the current component only. It makes the dependency relationship more explicit, and is more tree-shaking friendly.

When using SFC with 
<script setup>
, imported components can be locally used without registration:

vue

<

script

 setup

>

import

 ComponentA 

from

 './ComponentA.vue'

</

script

>

<

template

>

  <

ComponentA

 />

</

template

>

In non-
<script setup>
, you will need to use the 
components
 option:

js

import

 ComponentA 

from

 './ComponentA.js'

export

 default

 {

  components: {

    ComponentA

  },

  setup

() {

    // ...

  }

}

Local registration is done using the 
components
 option:

vue

<

script

>

import

 ComponentA 

from

 './ComponentA.vue'

export

 default

 {

  components: {

    ComponentA

  }

}

</

script

>

<

template

>

  <

ComponentA

 />

</

template

>

For each property in the 
components
 object, the key will be the registered name of the component, while the value will contain the implementation of the component. The above example is using the ES2015 property shorthand and is equivalent to:

js

export

 default

 {

  components: {

    ComponentA: ComponentA

  }

  // ...

}

Note that 
locally registered components are 
not
 also available in descendant components
. In this case, 
ComponentA
 will be made available to the current component only, not any of its child or descendant components.

Component Name Casing 
​

Throughout the guide, we are using PascalCase names when registering components. This is because:

PascalCase names are valid JavaScript identifiers. This makes it easier to i

...(truncated)

---

## Props | Vue.js

> Source: https://vuejs.org/guide/components/props

Props | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Props 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Watch a free video lesson on Vue School

Props Declaration 
​

Vue components require explicit props declaration so that Vue knows what external props passed to the component should be treated as fallthrough attributes (which will be discussed in 
its dedicated section
).

In SFCs using 
<script setup>
, props can be declared using the 
defineProps()
 macro:

vue

<

script

 setup

>

const

 props

 =

 defineProps

([

'foo'

])

console.

log

(props.foo)

</

script

>

In non-
<script setup>
 components, props are declared using the 

props

 option:

js

export

 default

 {

  props: [

'foo'

],

  setup

(

props

) {

    // setup() receives props as the first argument.

    console.

log

(props.foo)

  }

}

Notice the argument passed to 
defineProps()
 is the same as the value provided to the 
props
 options: the same props options API is shared between the two declaration styles.

Props are declared using the 

props

 option:

js

export

 default

 {

  props: [

'foo'

],

  created

() {

    // props are exposed on `this`

    console.

log

(

this

.foo)

  }

}

In addition to declaring props using an array of strings, we can also use the object syntax:

js

export

 default

 {

  props: {

    title: String,

    likes: Number

  }

}

js

// in <script setup>

defineProps

({

  title: String,

  likes: Number

})

js

// in non-<script setup>

export

 default

 {

  props: {

    title: String,

    likes: Number

  }

}

For each property in the object declaration syntax, the key is the name of the prop, while the value should be the constructor function of the expected type.

This not only documents your component, but will also warn other developers using your component in the browser console if they pass the wrong type. We will discuss more details about 
prop validation
 further down this page.

See also: 
Typing Component Props
 

If you are using TypeScript with 
<script setup>
, it's also possible to declare props using pure type annotations:

vue

<

script

 setup

 lang

=

"ts"

>

defineProps

<{

  title

?:

 string

  likes

?:

 number

}>()

</

script

>

More details: 
Typing Component Props
 

Reactive Props Destructure 

 
​

Vue's reactivity system tracks state usage based on property access. E.g. when you access 
props.foo
 in a computed getter or a watcher, the 
foo
 prop gets tracked as a dependency.

So, given the following code:

js

const

 { 

foo

 } 

=

 defineProps

([

'foo'

])

watchEffect

(() 

=>

 {

  // runs only once before 3.5

  // re-runs when the "foo" prop changes in 3.5+

  console.

log

(foo)

})

In version 3.4 and below, 
foo
 is an actual constant and will never change. In version 3.5 and above, Vue's compiler automatically prepends 
props.
 when code in the same 
<script setup>
 block accesses variables destructured from 
defineProps
. Therefore the code above becomes equivalent to the following:

js

const

 props

 =

 defineProps

([

'foo'

])

watchEffect

(() 

=>

 {

  // `foo` transformed to `props.foo` by the compiler

  console.

log

(props.foo)

})

In addition, you can use JavaScript's native default value syntax to declare default values for the props. This is particularly useful when using the type-based props declaration:

ts

const

 { 

foo

 =

 'hello'

 } 

=

 defineProps

<{ 

foo

?:

 string

 }>()

If you prefer to have more visual distinction between destructured props and normal variables in your IDE, Vue's VSCode extension provides a setting to enable inlay-hints for destructured props.

Passing D

...(truncated)

---

## Component Events | Vue.js

> Source: https://vuejs.org/guide/components/events

Component Events | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Component Events 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Watch a free video lesson on Vue School

Emitting and Listening to Events 
​

A component can emit custom events directly in template expressions (e.g. in a 
v-on
 handler) using the built-in 
$emit
 method:

template

<!-- MyComponent -->

<

button

 @

click

=

"

$emit

(

'someEvent'

)

"

>Click Me</

button

>

The 
$emit()
 method is also available on the component instance as 
this.$emit()
:

js

export

 default

 {

  methods: {

    submit

() {

      this

.

$emit

(

'someEvent'

)

    }

  }

}

The parent can then listen to it using 
v-on
:

template

<

MyComponent

 @

some-event

=

"

callback

"

 />

The 
.once
 modifier is also supported on component event listeners:

template

<

MyComponent

 @

some-event

.

once

=

"

callback

"

 />

Like components and props, event names provide an automatic case transformation. Notice we emitted a camelCase event, but can listen for it using a kebab-cased listener in the parent. As with 
props casing
, we recommend using kebab-cased event listeners in templates.

TIP

Unlike native DOM events, component emitted events do 
not
 bubble. You can only listen to the events emitted by a direct child component. If there is a need to communicate between sibling or deeply nested components, use an external event bus or a 
global state management solution
.

Event Arguments 
​

It's sometimes useful to emit a specific value with an event. For example, we may want the 
<BlogPost>
 component to be in charge of how much to enlarge the text by. In those cases, we can pass extra arguments to 
$emit
 to provide this value:

template

<

button

 @

click

=

"

$emit

(

'increaseBy'

, 

1

)

"

>

  Increase by 1

</

button

>

Then, when we listen to the event in the parent, we can use an inline arrow function as the listener, which allows us to access the event argument:

template

<

MyButton

 @

increase-by

=

"

(

n

) 

=>

 count 

+=

 n

"

 />

Or, if the event handler is a method:

template

<

MyButton

 @

increase-by

=

"

increaseCount

"

 />

Then the value will be passed as the first parameter of that method:

js

methods

: {

  increaseCount

(n) {

    this

.count 

+=

 n

  }

}

js

function

 increaseCount

(

n

) {

  count.value 

+=

 n

}

TIP

All extra arguments passed to 
$emit()
 after the event name will be forwarded to the listener. For example, with 
$emit('foo', 1, 2, 3)
 the listener function will receive three arguments.

Declaring Emitted Events 
​

A component can explicitly declare the events it will emit using the 

defineEmits()

 macro

emits

 option
:

vue

<

script

 setup

>

defineEmits

([

'inFocus'

, 

'submit'

])

</

script

>

The 
$emit
 method that we used in the 
<template>
 isn't accessible within the 
<script setup>
 section of a component, but 
defineEmits()
 returns an equivalent function that we can use instead:

vue

<

script

 setup

>

const

 emit

 =

 defineEmits

([

'inFocus'

, 

'submit'

])

function

 buttonClick

() {

  emit

(

'submit'

)

}

</

script

>

The 
defineEmits()
 macro 
cannot
 be used inside a function, it must be placed directly within 
<script setup>
, as in the example above.

If you're using an explicit 
setup
 function instead of 
<script setup>
, events should be declared using the 

emits

 option, and the 
emit
 function is exposed on the 
setup()
 context:

js

export

 default

 {

  emits: [

'inFocus'

, 

'submit'

],

  setup

(

props

, 

ctx

) {

    ctx.

emit

(

'submit'

)

  }

}

As with other properti

...(truncated)

---

## Component v-model | Vue.js

> Source: https://vuejs.org/guide/components/v-model

Component v-model | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Component v-model 
​

 Watch an interactive video lesson on Scrimba 

Basic Usage 
​

v-model
 can be used on a component to implement a two-way binding.

Starting in Vue 3.4, the recommended approach to achieve this is using the 

defineModel()

 macro:

Child.vue

vue

<

script

 setup

>

const

 model

 =

 defineModel

()

function

 update

() {

  model.value

++

}

</

script

>

<

template

>

  <

div

>Parent bound v-model is: {{ model }}</

div

>

  <

button

 @click

=

"update"

>Increment</

button

>

</

template

>

The parent can then bind a value with 
v-model
:

Parent.vue

template

<

Child

 v-model

=

"

countModel

"

 />

The value returned by 
defineModel()
 is a ref. It can be accessed and mutated like any other ref, except that it acts as a two-way binding between a parent value and a local one:

Its 
.value
 is synced with the value bound by the parent 
v-model
;

When it is mutated by the child, it causes the parent bound value to be updated as well.

This means you can also bind this ref to a native input element with 
v-model
, making it straightforward to wrap native input elements while providing the same 
v-model
 usage:

vue

<

script

 setup

>

const

 model

 =

 defineModel

()

</

script

>

<

template

>

  <

input

 v-model

=

"model"

 />

</

template

>

Try it in the playground

Under the Hood 
​

defineModel
 is a convenience macro. The compiler expands it to the following:

A prop named 
modelValue
, which the local ref's value is synced with;

An event named 
update:modelValue
, which is emitted when the local ref's value is mutated.

This is how you would implement the same child component shown above prior to 3.4:

Child.vue

vue

<

script

 setup

>

const

 props

 =

 defineProps

([

'modelValue'

])

const

 emit

 =

 defineEmits

([

'update:modelValue'

])

</

script

>

<

template

>

  <

input

    :value

=

"props.modelValue"

    @input

=

"emit('update:modelValue', $event.target.value)"

  />

</

template

>

Then, 
v-model="foo"
 in the parent component will be compiled to:

Parent.vue

template

<

Child

  :

modelValue

=

"

foo

"

  @

update

:

modelValue

=

"

$event

 =>

 (foo 

=

 $event)

"

/>

As you can see, it is quite a bit more verbose. However, it is helpful to understand what is happening under the hood.

Because 
defineModel
 declares a prop, you can therefore declare the underlying prop's options by passing it to 
defineModel
:

js

// making the v-model required

const

 model

 =

 defineModel

({ required: 

true

 })

// providing a default value

const

 model

 =

 defineModel

({ default: 

0

 })

WARNING

If you have a 
default
 value for 
defineModel
 prop and you don't provide any value for this prop from the parent component, it can cause a de-synchronization between parent and child components. In the example below, the parent's 
myRef
 is undefined, but the child's 
model
 is 1:

Child.vue

vue

<

script

 setup

>

const

 model

 =

 defineModel

({ default: 

1

 })

</

script

>

Parent.vue

vue

<

script

 setup

>

const

 myRef

 =

 ref

()

</

script

>

<

template

>

  <

Child

 v-model

=

"myRef"

></

Child

>

</

template

>

First let's revisit how 
v-model
 is used on a native element:

template

<

input

 v-model

=

"

searchText

"

 />

Under the hood, the template compiler expands 
v-model
 to the more verbose equivalent for us. So the above code does the same as the following:

template

<

input

  :

value

=

"

searchText

"

  @

input

=

"

searchText 

=

 $event.target.value

"

/>

When used on a component, 
v-model
 instead expands to this:

template


...(truncated)

---

## Fallthrough Attributes | Vue.js

> Source: https://vuejs.org/guide/components/attrs

Fallthrough Attributes | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Fallthrough Attributes 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Attribute Inheritance 
​

A "fallthrough attribute" is an attribute or 
v-on
 event listener that is passed to a component, but is not explicitly declared in the receiving component's 
props
 or 
emits
. Common examples of this include 
class
, 
style
, and 
id
 attributes.

When a component renders a single root element, fallthrough attributes will be automatically added to the root element's attributes. For example, given a 
<MyButton>
 component with the following template:

template

<!-- template of <MyButton> -->

<

button

>Click Me</

button

>

And a parent using this component with:

template

<

MyButton

 class

=

"large"

 />

The final rendered DOM would be:

html

<

button

 class

=

"large"

>Click Me</

button

>

Here, 
<MyButton>
 did not declare 
class
 as an accepted prop. Therefore, 
class
 is treated as a fallthrough attribute and automatically added to 
<MyButton>
's root element.

class
 and 
style
 Merging 
​

If the child component's root element already has existing 
class
 or 
style
 attributes, it will be merged with the 
class
 and 
style
 values that are inherited from the parent. Suppose we change the template of 
<MyButton>
 in the previous example to:

template

<!-- template of <MyButton> -->

<

button

 class

=

"btn"

>Click Me</

button

>

Then the final rendered DOM would now become:

html

<

button

 class

=

"btn large"

>Click Me</

button

>

v-on
 Listener Inheritance 
​

The same rule applies to 
v-on
 event listeners:

template

<

MyButton

 @

click

=

"

onClick

"

 />

The 
click
 listener will be added to the root element of 
<MyButton>
, i.e. the native 
<button>
 element. When the native 
<button>
 is clicked, it will trigger the 
onClick
 method of the parent component. If the native 
<button>
 already has a 
click
 listener bound with 
v-on
, then both listeners will trigger.

Nested Component Inheritance 
​

If a component renders another component as its root node, for example, we refactored 
<MyButton>
 to render a 
<BaseButton>
 as its root:

template

<!-- template of <MyButton/> that simply renders another component -->

<

BaseButton

 />

Then the fallthrough attributes received by 
<MyButton>
 will be automatically forwarded to 
<BaseButton>
.

Note that:

Forwarded attributes do not include any attributes that are declared as props, or 
v-on
 listeners of declared events by 
<MyButton>
 - in other words, the declared props and listeners have been "consumed" by 
<MyButton>
.

Forwarded attributes may be accepted as props by 
<BaseButton>
, if declared by it.

Disabling Attribute Inheritance 
​

If you do 
not
 want a component to automatically inherit attributes, you can set 
inheritAttrs: false
 in the component's options.

Since 3.3 you can also use 

defineOptions

 directly in 
<script setup>
:

vue

<

script

 setup

>

defineOptions

({

  inheritAttrs: 

false

})

// ...setup logic

</

script

>

The common scenario for disabling attribute inheritance is when attributes need to be applied to other elements besides the root node. By setting the 
inheritAttrs
 option to 
false
, you can take full control over where the fallthrough attributes should be applied.

These fallthrough attributes can be accessed directly in template expressions as 
$attrs
:

template

<

span

>Fallthrough attributes: {{ $attrs }}</

span

>

The 
$attrs
 object includes all attributes that are not declared by the component's 
props
 or 
emits
 options (e.g., 
class
, 
style
, 
v-on
 listeners, etc.).

Some notes:

U

...(truncated)

---

## Slots | Vue.js

> Source: https://vuejs.org/guide/components/slots

Slots | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Slots 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Watch a free video lesson on Vue School

Slot Content and Outlet 
​

We have learned that components can accept props, which can be JavaScript values of any type. But how about template content? In some cases, we may want to pass a template fragment to a child component, and let the child component render the fragment within its own template.

For example, we may have a 
<FancyButton>
 component that supports usage like this:

template

<

FancyButton

>

  Click me! 

<!-- slot content -->

</

FancyButton

>

The template of 
<FancyButton>
 looks like this:

template

<

button

 class

=

"fancy-btn"

>

  <

slot

></

slot

> 

<!-- slot outlet -->

</

button

>

The 
<slot>
 element is a 
slot outlet
 that indicates where the parent-provided 
slot content
 should be rendered.

And the final rendered DOM:

html

<

button

 class

=

"fancy-btn"

>Click me!</

button

>

Try it in the Playground

Try it in the Playground

With slots, the 
<FancyButton>
 is responsible for rendering the outer 
<button>
 (and its fancy styling), while the inner content is provided by the parent component.

Another way to understand slots is by comparing them to JavaScript functions:

js

// parent component passing slot content

FancyButton

(

'Click me!'

)

// FancyButton renders slot content in its own template

function

 FancyButton

(

slotContent

) {

  return

 `<button class="fancy-btn">

      ${

slotContent

}

    </button>`

}

Slot content is not just limited to text. It can be any valid template content. For example, we can pass in multiple elements, or even other components:

template

<

FancyButton

>

  <

span

 style

=

"color:red"

>Click me!</

span

>

  <

AwesomeIcon

 name

=

"plus"

 />

</

FancyButton

>

Try it in the Playground

Try it in the Playground

By using slots, our 
<FancyButton>
 is more flexible and reusable. We can now use it in different places with different inner content, but all with the same fancy styling.

Vue components' slot mechanism is inspired by the 
native Web Component 
<slot>
 element
, but with additional capabilities that we will see later.

Render Scope 
​

Slot content has access to the data scope of the parent component, because it is defined in the parent. For example:

template

<

span

>{{ message }}</

span

>

<

FancyButton

>{{ message }}</

FancyButton

>

Here both 

{{ message }}

 interpolations will render the same content.

Slot content does 
not
 have access to the child component's data. Expressions in Vue templates can only access the scope it is defined in, consistent with JavaScript's lexical scoping. In other words:

Expressions in the parent template only have access to the parent scope; expressions in the child template only have access to the child scope.

Fallback Content 
​

There are cases when it's useful to specify fallback (i.e. default) content for a slot, to be rendered only when no content is provided. For example, in a 
<SubmitButton>
 component:

template

<

button

 type

=

"submit"

>

  <

slot

></

slot

>

</

button

>

We might want the text "Submit" to be rendered inside the 
<button>
 if the parent didn't provide any slot content. To make "Submit" the fallback content, we can place it in between the 
<slot>
 tags:

template

<

button

 type

=

"submit"

>

  <

slot

>

    Submit 

<!-- fallback content -->

  </

slot

>

</

button

>

Now when we use 
<SubmitButton>
 in a parent component, providing no content for the slot:

template

<

SubmitButton

 />

This will render the fallback content, "Submit"

...(truncated)

---

## Provide / Inject | Vue.js

> Source: https://vuejs.org/guide/components/provide-inject

Provide / Inject | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Provide / Inject 
​

This page assumes you've already read the 
Components Basics
. Read that first if you are new to components.

Prop Drilling 
​

Usually, when we need to pass data from the parent to a child component, we use 
props
. However, imagine the case where we have a large component tree, and a deeply nested component needs something from a distant ancestor component. With only props, we would have to pass the same prop across the entire parent chain:

Notice although the 
<Footer>
 component may not care about these props at all, it still needs to declare and pass them along just so 
<DeepChild>
 can access them. If there is a longer parent chain, more components would be affected along the way. This is called "props drilling" and definitely isn't fun to deal with.

We can solve props drilling with 
provide
 and 
inject
. A parent component can serve as a 
dependency provider
 for all its descendants. Any component in the descendant tree, regardless of how deep it is, can 
inject
 dependencies provided by components up in its parent chain.

Provide 
​

To provide data to a component's descendants, use the 

provide()

 function:

vue

<

script

 setup

>

import

 { provide } 

from

 'vue'

provide

(

/* key */

 'message'

, 

/* value */

 'hello!'

)

</

script

>

If not using 
<script setup>
, make sure 
provide()
 is called synchronously inside 
setup()
:

js

import

 { provide } 

from

 'vue'

export

 default

 {

  setup

() {

    provide

(

/* key */

 'message'

, 

/* value */

 'hello!'

)

  }

}

The 
provide()
 function accepts two arguments. The first argument is called the 
injection key
, which can be a string or a 
Symbol
. The injection key is used by descendant components to lookup the desired value to inject. A single component can call 
provide()
 multiple times with different injection keys to provide different values.

The second argument is the provided value. The value can be of any type, including reactive state such as refs:

js

import

 { ref, provide } 

from

 'vue'

const

 count

 =

 ref

(

0

)

provide

(

'key'

, count)

Providing reactive values allows the descendant components using the provided value to establish a reactive connection to the provider component.

To provide data to a component's descendants, use the 

provide

 option:

js

export

 default

 {

  provide: {

    message: 

'hello!'

  }

}

For each property in the 
provide
 object, the key is used by child components to locate the correct value to inject, while the value is what ends up being injected.

If we need to provide per-instance state, for example data declared via the 
data()
, then 
provide
 must use a function value:

js

export

 default

 {

  data

() {

    return

 {

      message: 

'hello!'

    }

  },

  provide

() {

    // use function syntax so that we can access `this`

    return

 {

      message: 

this

.message

    }

  }

}

However, do note this does 
not
 make the injection reactive. We will discuss 
making injections reactive
 below.

App-level Provide 
​

In addition to providing data in a component, we can also provide at the app level:

js

import

 { createApp } 

from

 'vue'

const

 app

 =

 createApp

({})

app.

provide

(

/* key */

 'message'

, 

/* value */

 'hello!'

)

App-level provides are available to all components rendered in the app. This is especially useful when writing 
plugins
, as plugins typically wouldn't be able to provide values using components.

Inject 
​

To inject data provided by an ancestor component, use the 

inject()

 function:

vue

<

script

 setup

>

import

 { inject } 

from

 'vue'

const

 messa

...(truncated)

---

## Async Components | Vue.js

> Source: https://vuejs.org/guide/components/async

Async Components | Vue.js

    

    

    

    

    
    
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    
    
    
    
    
    
    

  

  

    

Skip to content

Menu

On this page 

On this page

Sponsors

Become a Sponsor

Async Components 
​

Basic Usage 
​

In large applications, we may need to divide the app into smaller chunks and only load a component from the server when it's needed. To make that possible, Vue has a 

defineAsyncComponent

 function:

js

import

 { defineAsyncComponent } 

from

 'vue'

const

 AsyncComp

 =

 defineAsyncComponent

(() 

=>

 {

  return

 new

 Promise

((

resolve

, 

reject

) 

=>

 {

    // ...load component from server

    resolve

(

/* loaded component */

)

  })

})

// ... use `AsyncComp` like a normal component

As you can see, 
defineAsyncComponent
 accepts a loader function that returns a Promise. The Promise's 
resolve
 callback should be called when you have retrieved your component definition from the server. You can also call 
reject(reason)
 to indicate the load has failed.

ES module dynamic import
 also returns a Promise, so most of the time we will use it in combination with 
defineAsyncComponent
. Bundlers like Vite and webpack also support the syntax (and will use it as bundle split points), so we can use it to import Vue SFCs:

js

import

 { defineAsyncComponent } 

from

 'vue'

const

 AsyncComp

 =

 defineAsyncComponent

(() 

=>

  import

(

'./components/MyComponent.vue'

)

)

The resulting 
AsyncComp
 is a wrapper component that only calls the loader function when it is actually rendered on the page. In addition, it will pass along any props and slots to the inner component, so you can use the async wrapper to seamlessly replace the original component while achieving lazy loading.

As with normal components, async components can be 
registered globally
 using 
app.component()
:

js

app.

component

(

'MyComponent'

, 

defineAsyncComponent

(() 

=>

  import

(

'./components/MyComponent.vue'

)

))

You can also use 
defineAsyncComponent
 when 
registering a component locally
:

vue

<

script

>

import

 { defineAsyncComponent } 

from

 'vue'

export

 default

 {

  components: {

    AdminPage: 

defineAsyncComponent

(() 

=>

      import

(

'./components/AdminPageComponent.vue'

)

    )

  }

}

</

script

>

<

template

>

  <

AdminPage

 />

</

template

>

They can also be defined directly inside their parent component:

vue

<

script

 setup

>

import

 { defineAsyncComponent } 

from

 'vue'

const

 AdminPage

 =

 defineAsyncComponent

(() 

=>

  import

(

'./components/AdminPageComponent.vue'

)

)

</

script

>

<

template

>

  <

AdminPage

 />

</

template

>

Loading and Error States 
​

Asynchronous operations inevitably involve loading and error states - 
defineAsyncComponent()
 supports handling these states via advanced options:

js

const

 AsyncComp

 =

 defineAsyncComponent

({

  // the loader function

  loader

: () 

=>

 import

(

'./Foo.vue'

),

  // A component to use while the async component is loading

  loadingComponent: LoadingComponent,

  // Delay before showing the loading component. Default: 200ms.

  delay: 

200

,

  // A component to use if the load fails

  errorComponent: ErrorComponent,

  // The error component will be displayed if a timeout is

  // provided and exceeded. Default: Infinity.

  timeout: 

3000

})

If a loading component is provided, it will be displayed first while the inner component is being loaded. There is a default 200ms delay before the loading component is shown - this is because on fast networks, an instant loading state may get replaced too fast and end up looking like a flicker.

If an error component is provided, it will be displayed when the Promise returned by the loader function is rejected. You can also specify a timeout to show the error component when 

...(truncated)

---

