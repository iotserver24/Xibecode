---
description: Skill learned from https://docs.megallm.io/ — 25 pages scraped
tags: learned, docs, megallm
source: https://docs.megallm.io/
---

# megallm

> Learned from [https://docs.megallm.io/](https://docs.megallm.io/) — 25 pages

## MegaLLM Documentation - MegaLLM

> Source: https://docs.megallm.io

MegaLLM Documentation - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

MegaLLM Documentation

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

What is MegaLLM?

Why MegaLLM?

Quick Start

Core Features

Who Uses MegaLLM?

Developers

Businesses

Researchers

Example: Switching Models

Popular Model Combinations

Getting Started

3-Step Setup

Need Help?

One API, Unlimited Possibilities
: Access GPT-5, Claude Opus 4.1, Gemini 2.5 Pro, and more models without juggling multiple providers.

​

What is MegaLLM?

MegaLLM is your 
“super-API”
 for AI. Instead of integrating with OpenAI, Anthropic, Google, and other providers separately, you get access to all their models through one unified interface.

​

Why MegaLLM?

Instant Model Switching
: Change models with one parameter

Automatic Fallbacks
: Never go down when one model fails

Unified Billing
: One invoice for all your AI usage

Zero Integration Overhead
: Drop-in replacement for existing code

​

Quick Start

Models Catalog

Browse 70+ AI models with pricing and capabilities

Quick Start

Get your API key and make your first request

OpenAI API

Use OpenAI-compatible endpoints with any model

Anthropic API

Access Claude models with Anthropic format

​

Core Features

Automatic Fallback

Ensure high availability with intelligent model switching

Authentication

Simple API key management and security

FAQ

Frequently asked questions and troubleshooting

​

Who Uses MegaLLM?

​

Developers

Experiment with different models without rewriting code

Reduce integration complexity from weeks to minutes

Build more robust applications with automatic fallbacks

​

Businesses

Ensure high availability for customer-facing AI features

Optimize costs across multiple model providers

Future-proof AI investments with provider flexibility

​

Researchers

Access cutting-edge models as they’re released

Run comprehensive evaluations and benchmarks

Test model performance across different tasks

​

Example: Switching Models

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

# Try GPT-5 for complex reasoning

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Analyze this data..."

}]

)

# Switch to Claude for analysis

response 

=

 client.chat.completions.create(

    model

=

"claude-3.7-sonnet"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Analyze this data..."

}]

)

# Use Claude for creative writing

response 

=

 client.chat.completions.create(

    model

=

"claude-opus-4-1-20250805"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Write a story about..."

}]

)

​

Popular Model Combinations

Use Case

Primary Model

Fallback Models

Why

Chatbots

gpt-4o-mini

gpt-3.5-turbo, claude-3.5-sonnet

Fast, cost-effective

Code Generation

gpt-5

claude-3.7-sonnet, gpt-4o

Specialized for code

Analysis

claude-opus-4-1-20250805

gpt-5, gemini-2.5-pro

Best reasoning

Creative Writing

claude-opus-4-1-20250805

gpt-5, claude-sonnet-4

Creative excellence

​

Getting Started

Ready to get started?
 Head to our 
Quick Start guide
 to make your first API call in minutes.

​

3-Step Setup

Get API Key
: Sign up and get your MegaLLM API key

Choose Format
: Use OpenAI or Anthropic API format

Start Building
: Make your first request to any of 70+ models

​

Need Help?

Browse our guides
: Comprehensive documentation for every feature

Check the FAQ
: Common questions and solutions

Contact support
: 

[email&#160;protected]

 for technical assistance

Use search
: Press Cmd+K to search all docume

...(truncated)

---

## ffba96ab804f907e.css

> Source: https://docs.megallm.io/mintlify-assets/_next/static/css/ffba96ab804f907e.css

/*
! tailwindcss v3.4.4 | MIT License | https://tailwindcss.com
*/*,:after,:before{box-sizing:border-box;border-width:0;border-style:solid;border-color:rgb(var(--gray-200))}:after,:before{--tw-content:""}:host,html{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;font-family:var(--font-inter),ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";font-feature-settings:normal;font-variation-settings:normal;-webkit-tap-highlight-color:transparent}body{margin:0;line-height:inherit}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,pre,samp{font-family:var(--font-jetbrains-mono),ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-feature-settings:normal;font-variation-settings:normal;font-size:1em}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:initial}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}button,input,optgroup,select,textarea{font-family:inherit;font-feature-settings:inherit;font-variation-settings:inherit;font-size:100%;font-weight:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;margin:0;padding:0}button,select{text-transform:none}button,input:where([type=button]),input:where([type=reset]),input:where([type=submit]){-webkit-appearance:button;background-color:initial;background-image:none}:-moz-focusring{outline:auto}:-moz-ui-invalid{box-shadow:none}progress{vertical-align:initial}::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}summary{display:list-item}blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre{margin:0}fieldset{margin:0}fieldset,legend{padding:0}menu,ol,ul{list-style:none;margin:0;padding:0}dialog{padding:0}textarea{resize:vertical}input::placeholder,textarea::placeholder{opacity:1;color:rgb(var(--gray-400))}[role=button],button{cursor:pointer}:disabled{cursor:default}audio,canvas,embed,iframe,img,object,svg,video{display:block;vertical-align:middle}img,video{max-width:100%;height:auto}[hidden]{display:none}@supports (-moz-appearance:none){*{scrollbar-color:auto;scrollbar-width:auto}}@font-face{font-family:Latin Modern;font-style:normal;font-weight:400;font-display:block;src:url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-regular.ttf) format("truetype"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-regular.woff) format("woff"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-regular.woff2) format("woff2")}@font-face{font-family:Latin Modern;font-style:italic;font-weight:400;font-display:block;src:url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-italic.ttf) format("truetype"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-italic.woff) format("woff"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-italic.woff2) format("woff2")}@font-face{font-family:Latin Modern;font-style:normal;font-weight:700;font-display:block;src:url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-bold.ttf) format("truetype"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-bold.woff) format("woff"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-bold.woff2) format("woff2")}@font-face{font-family:Latin Modern;font-style:italic;font-weight:700;font-display:block;src:url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-bold-italic.ttf) format("truetype"),url(https://cdn.jsdelivr.net/gh/vincentdoerig/latex-css/fonts/LM-bold-italic.woff) format("woff"),url(h

...(truncated)

---

## 6f9b80d484ead711.css

> Source: https://docs.megallm.io/mintlify-assets/_next/static/css/6f9b80d484ead711.css

.json-view{display:block;color:#4d4d4d;text-align:left;--json-property:#009033;--json-index:#676dff;--json-number:#676dff;--json-string:#b2762e;--json-boolean:#dc155e;--json-null:#dc155e}.json-view .json-view--property{color:var(--json-property)}.json-view .json-view--index{color:var(--json-index)}.json-view .json-view--number{color:var(--json-number)}.json-view .json-view--string{color:var(--json-string)}.json-view .json-view--boolean{color:var(--json-boolean)}.json-view .json-view--null{color:var(--json-null)}.json-view .jv-indent{padding-left:1em}.json-view .jv-chevron{display:inline-block;vertical-align:-20%;cursor:pointer;opacity:.4;width:1em;height:1em}:is(.json-view .jv-chevron:hover,.json-view .jv-size:hover+.jv-chevron){opacity:.8}.json-view .jv-size{cursor:pointer;opacity:.4;font-size:.875em;font-style:italic;margin-left:.5em;vertical-align:-5%;line-height:1}.json-view .json-view--link svg,.json-view :is(.json-view--copy,.json-view--edit){display:none;width:1em;height:1em;margin-left:.25em;cursor:pointer}.json-view .json-view--input{width:120px;margin-left:.25em;border-radius:4px;border:1px solid;padding:0 4px;font-size:87.5%;line-height:1.25;background:transparent}.json-view .json-view--deleting{outline:1px solid #da0000;background-color:#da000011;text-decoration-line:line-through}:is(.json-view:hover,.json-view--pair:hover)>.json-view--link svg,:is(.json-view:hover,.json-view--pair:hover)>:is(.json-view--copy,.json-view--edit){display:inline-block}.json-view .jv-button{background:transparent;outline:none;border:none;cursor:pointer;color:inherit}.json-view .cursor-pointer{cursor:pointer}.json-view svg{vertical-align:-10%}.jv-size-chevron~svg{vertical-align:-16%}.json-view_a11y{color:#545454;--json-property:#aa5d00;--json-index:#007299;--json-number:#007299;--json-string:green;--json-boolean:#d91e18;--json-null:#d91e18}.json-view_github{color:#005cc5;--json-property:#005cc5;--json-index:#005cc5;--json-number:#005cc5;--json-string:#032f62;--json-boolean:#005cc5;--json-null:#005cc5}.json-view_vscode{color:#005cc5;--json-property:#0451a5;--json-index:#00f;--json-number:#00f;--json-string:#a31515;--json-boolean:#00f;--json-null:#00f}.json-view_atom{color:#383a42;--json-property:#e45649;--json-index:#986801;--json-number:#986801;--json-string:#50a14f;--json-boolean:#0184bc;--json-null:#0184bc}.json-view_winter-is-coming{color:#0431fa;--json-property:#3a9685;--json-index:#ae408b;--json-number:#ae408b;--json-string:#8123a9;--json-boolean:#0184bc;--json-null:#0184bc}*,::backdrop,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }#next-cache-toolbar{--background:0 0% 100%;--foreground:222.2 47.4% 11.2%;--muted:210 40% 96.1%;--muted-foreground:215.4 16.3% 46.9%;--popover:0 0% 100%;--popover-foreground:222.2 47.4% 11.2%;--border:214.3 31.8% 91.4%;--input:214.3 31.8% 91.4%;--card:0 0% 100%;--card-foreground:222.2 47.4% 11.2%;--primary:222.2 47.4% 11.2%;--primary-foreground:210 40% 98%;

...(truncated)

---

## 99ae30c69aabebdd.css

> Source: https://docs.megallm.io/mintlify-assets/_next/static/css/99ae30c69aabebdd.css

:root{--twoslash-border-color:#dbdfde;--twoslash-underline-color:currentColor;--twoslash-popup-bg:#f3f7f6;--twoslash-popup-color:inherit;--twoslash-popup-shadow:rgba(0,0,0,0.08) 0px 1px 4px;--twoslash-code-font:inherit;--twoslash-code-font-size:1em;--twoslash-matched-color:inherit;--twoslash-highlighted-border:#c37d0d50;--twoslash-highlighted-bg:#c37d0d20;--twoslash-unmatched-color:#888;--twoslash-cursor-color:#8888;--twoslash-error-color:#d45656;--twoslash-error-bg:#d4565620;--twoslash-warn-color:#c37d0d;--twoslash-warn-bg:#c37d0d20;--twoslash-tag-color:#3772cf;--twoslash-tag-bg:#3772cf20;--twoslash-tag-warn-color:var(--twoslash-warn-color);--twoslash-tag-warn-bg:var(--twoslash-warn-bg);--twoslash-tag-annotate-color:#1ba673;--twoslash-tag-annotate-bg:#1ba67320;--twoslash-text-size:0.8rem;--twoslash-docs-tag-style:italic}:root.twoslash-dark,html.dark div.dark\:twoslash-dark,html.dark div.twoslash-dark{--twoslash-border-color:#222526;--twoslash-popup-bg:#151819;--twoslash-highlighted-border:#ffa50080;--twoslash-highlighted-bg:#ffa50030;--twoslash-unmatched-color:#aaa;--twoslash-cursor-color:#bbbb;--twoslash-error-color:#ff6b6b;--twoslash-error-bg:#ff6b6b30;--twoslash-warn-color:#ffa500;--twoslash-warn-bg:#ffa50030;--twoslash-tag-color:#6bb6ff;--twoslash-tag-bg:#6bb6ff30;--twoslash-tag-warn-color:var(--twoslash-warn-color);--twoslash-tag-warn-bg:var(--twoslash-warn-bg);--twoslash-tag-annotate-color:#4ade80;--twoslash-tag-annotate-bg:#4ade8030}@media (prefers-reduced-motion:reduce){.twoslash *{transition:none!important}}.twoslash:hover .twoslash-hover{border-color:var(--twoslash-underline-color)}.twoslash .twoslash-hover{border-bottom:1px dotted transparent;transition-timing-function:ease;transition:border-color .3s;position:relative}.twoslash a span.twoslash-hover{border-bottom:1px solid var(--twoslash-underline-color);position:relative}.twoslash a span.twoslash-hover:hover{opacity:.75}.twoslash-popup-container .code-block{width:100%;margin-top:8px!important;margin-bottom:8px!important}.mint-twoslash-popover div[data-component-part=code-block-root]{width:100%}[data-radix-popper-content-wrapper]{z-index:9999!important}.mint-twoslash-popover{background:var(--twoslash-popup-bg);color:var(--twoslash-popup-color);border:1px solid var(--twoslash-border-color);border-radius:10px;font-size:var(--twoslash-text-size)!important;pointer-events:auto;text-align:left;box-shadow:var(--twoslash-popup-shadow);display:inline-flex;flex-direction:column;padding:6px;max-width:50vw}.mint-twoslash-popover-pre{width:100%;display:flex;font-size:var(--twoslash-text-size);font-family:var(--twoslash-code-font);font-weight:400}.mint-twoslash-popover code{padding:0!important;background:transparent!important}code.twoslash-popup-code.shiki{padding:8px!important}.mint-twoslash-popover:hover{-webkit-user-select:auto;user-select:auto}.twoslash .twoslash-popup-arrow{display:none}.twoslash-popup-code,.twoslash-popup-docs,.twoslash-popup-error{padding:6px 8px!important}.mint-twoslash-popover .twoslash-popup-docs{max-width:unset}.mint-twoslash-popover .twoslash-popup-error{color:var(--twoslash-error-color);background-color:var(--twoslash-error-bg)}.mint-twoslash-popover .twoslash-popup-docs-tags{display:flex;flex-direction:column}.mint-twoslash-popover .twoslash-popup-docs-tag-name{margin-right:.5em;font-style:var(--twoslash-docs-tag-style);font-family:var(--twoslash-code-font)}.mint-twoslash-popover .twoslash-query-line .twoslash-popup-container{position:relative;margin-bottom:1.4em;transform:translateY(.6em)}div.twoslash-meta-line.twoslash-query-line{display:contents}.twoslash-error-line{position:relative;background-color:var(--twoslash-error-bg);border-left:3px solid var(--twoslash-error-color);color:var(--twoslash-error-color);padding:6px 12px;margin:.2em 0;min-width:100%;width:max-content}.twoslash-error-line.twoslash-error-level-warning{background-color:var(--twoslash-warn-bg);border-left:3px solid var(--twoslash-warn-color);color:var(--twoslash-warn-color)}.min

...(truncated)

---

## webpack-4d2a7cab992ba6de.js

> Source: https://docs.megallm.io/mintlify-assets/_next/static/chunks/webpack-4d2a7cab992ba6de.js

(()=>{"use strict";var e={},a={};function d(c){var f=a[c];if(void 0!==f)return f.exports;var b=a[c]={id:c,loaded:!1,exports:{}},t=!0;try{e[c].call(b.exports,b,b.exports,d),t=!1}finally{t&&delete a[c]}return b.loaded=!0,b.exports}d.m=e,(()=>{var e=[];d.O=(a,c,f,b)=>{if(c){b=b||0;for(var t=e.length;t>0&&e[t-1][2]>b;t--)e[t]=e[t-1];e[t]=[c,f,b];return}for(var r=1/0,t=0;t
=b)&&Object.keys(d.O).every(e=>d.O[e](c[n]))?c.splice(n--,1):(o=!1,b
{var a=e&&e.__esModule?()=>e.default:()=>e;return d.d(a,{a:a}),a},(()=>{var e,a=Object.getPrototypeOf?e=>Object.getPrototypeOf(e):e=>e.__proto__;d.t=function(c,f){if(1&f&&(c=this(c)),8&f||"object"==typeof c&&c&&(4&f&&c.__esModule||16&f&&"function"==typeof c.then))return c;var b=Object.create(null);d.r(b);var t={};e=e||[null,a({}),a([]),a(a)];for(var r=2&f&&c;"object"==typeof r&&!~e.indexOf(r);r=a(r))Object.getOwnPropertyNames(r).forEach(e=>t[e]=()=>c[e]);return t.default=()=>c,d.d(b,t),b}})(),d.d=(e,a)=>{for(var c in a)d.o(a,c)&&!d.o(e,c)&&Object.defineProperty(e,c,{enumerable:!0,get:a[c]})},d.f={},d.e=e=>Promise.all(Object.keys(d.f).reduce((a,c)=>(d.f[c](e,a),a),[])),d.u=e=>"static/chunks/"+(({803:"cd24890f",3010:"79255fb1",3104:"schemaFilter",3616:"d917f8c9",4762:"b3ef812f",9992:"b74732b4",11666:"gtag",12391:"google-tag-manager",13450:"025569ea",17043:"246f48ee",19694:"legacyVideos",20521:"remoteMiddleware",21118:"fee25fe5",23303:"1af7daee",23849:"87851ddc",27696:"33d0405b",28205:"a8f60c33",30260:"336436a7",31659:"a4f73d83",32256:"f962536f",33220:"dfccc8e5",33346:"61809764",33543:"6907ee1e",35050:"ajs-destination",36013:"544dd070",38211:"d50c9df7",42751:"middleware",50662:"bd5c2553",55284:"16accd03",59226:"1fedf427",59430:"59a51a4c",60019:"87eca4bb",66215:"17db9782",68561:"f1fd93f1",69010:"tsub-middleware",74177:"19a2cade",77401:"baeaa4ff",79188:"8cb9cc52",80248:"auto-track",81917:"58f38233",87510:"14545bd4",91502:"4ecd8737",93709:"022278da",94635:"d1fd0142",97538:"queryString",99223:"08e9f8d4"})[e]||e)+"."+({74:"b5f26c33226cdc60",128:"5156661e309aaf37",745:"4f43f975d5fddaf9",803:"debc97bac8bd1786",806:"ae9cd5c3331e6a43",841:"1ff6ac766f3d9950",896:"09558fc8469a4811",1478:"7493947e4b5c0715",1670:"f188c90d47a80fbd",1759:"5199acd440b6ca85",1832:"45361be49aacd559",1953:"30c379c0af868e32",2028:"c44713af7e4a9af2",2383:"ff4e82514a9b28d8",2607:"5a8c693f34bc60a4",2924:"cd1648a439c867ad",2958:"55551645abcbcc93",3010:"34dfabe3840b8bdd",3042:"9ca9f8ddaf3d7026",3104:"3b15cfd381036a22",3206:"a661a763484ec5b8",3616:"c5a1ad48f3a3ae65",3618:"55376e259e3001c1",3831:"716527ff88640b0a",3882:"9a7b2f7eafe8e29b",4028:"92a6cbe098dcd85e",4528:"2deabb125685ade6",4626:"d0b5fdcc886f1158",4645:"ba0f5337af1992ff",4762:"287b5ce983a6f934",4947:"0f8c3c1722a7022a",4995:"16d315dacd9c6a32",5289:"f0aad39b35378bf4",5363:"2449a6be9967eb0f",5706:"bad83e09f8e2514b",5823:"5e554ab1ee9d3ced",5924:"af6b06b26a098f2d",6234:"b57a9f09b64783f7",6242:"bbce73b888a96871",6566:"b1b1f5a2497c85bf",6683:"bf3e2cce7b3ddcc4",6978:"a978e90a3db7cde6",7030:"157cd8e695043d50",7130:"2f98f149fbe9bfca",7467:"88b033551954dc18",7494:"5429d6728c8e7c9d",7673:"c70382e176895a06",7683:"0129120c45147b62",7768:"f0e7ad4969651193",7920:"b5135d107741af5c",8025:"c9c7aeb0bdf53148",8157:"06778e0d7f27a6c3",8796:"a367194970166ea6",8978:"9058450a438a413d",9058:"928ea6eb6bd689bf",9121:"acc1a8e2ba5c2c23",9313:"2332d143894785fa",9806:"bad6e24efdd11939",9887:"adebdfcbc6d67b22",9953:"13297e0d19eaf6b5",9992:"c62eb409c0d356f5",10340:"a4e2ec5d6fdc6562",10661:"996ebf90e070ef2a",10979:"9311cf856844487f",11022:"81651a06bf2b3e1b",11164:"8c8ac6e86b1c7e7b",11306:"193cf682b43d049d",11476:"2b469d8f4098fc87",11666:"f8641f1ff2daa875",11874:"fef440fd262e0440",11945:"369010f1cd5b3b8f",11958:"e90f5a04d7ee0ec0",12009:"675b79530451c143",12268:"97e195b4fb8afae9",12372:"5eb0dfb1a1db8698",12391:"18f5d473ef80d2db",12398:"d6fb36bf739177b0",12617:"f65e6cbadaf09eac",12639:"cd75ce01425476c2",12853:"3cc0398365f497ef",12993:"495c9a3c5a39233e",13103:"227b24f759f35e82",13107:"4b67a8a041b00d45",13381:"b67207edb6

...(truncated)

---

## MegaLLM Documentation - MegaLLM

> Source: https://docs.megallm.io/en/home/introduction

MegaLLM Documentation - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

MegaLLM Documentation

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

What is MegaLLM?

Why MegaLLM?

Quick Start

Core Features

Who Uses MegaLLM?

Developers

Businesses

Researchers

Example: Switching Models

Popular Model Combinations

Getting Started

3-Step Setup

Need Help?

One API, Unlimited Possibilities
: Access GPT-5, Claude Opus 4.1, Gemini 2.5 Pro, and more models without juggling multiple providers.

​

What is MegaLLM?

MegaLLM is your 
“super-API”
 for AI. Instead of integrating with OpenAI, Anthropic, Google, and other providers separately, you get access to all their models through one unified interface.

​

Why MegaLLM?

Instant Model Switching
: Change models with one parameter

Automatic Fallbacks
: Never go down when one model fails

Unified Billing
: One invoice for all your AI usage

Zero Integration Overhead
: Drop-in replacement for existing code

​

Quick Start

Models Catalog

Browse 70+ AI models with pricing and capabilities

Quick Start

Get your API key and make your first request

OpenAI API

Use OpenAI-compatible endpoints with any model

Anthropic API

Access Claude models with Anthropic format

​

Core Features

Automatic Fallback

Ensure high availability with intelligent model switching

Authentication

Simple API key management and security

FAQ

Frequently asked questions and troubleshooting

​

Who Uses MegaLLM?

​

Developers

Experiment with different models without rewriting code

Reduce integration complexity from weeks to minutes

Build more robust applications with automatic fallbacks

​

Businesses

Ensure high availability for customer-facing AI features

Optimize costs across multiple model providers

Future-proof AI investments with provider flexibility

​

Researchers

Access cutting-edge models as they’re released

Run comprehensive evaluations and benchmarks

Test model performance across different tasks

​

Example: Switching Models

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

# Try GPT-5 for complex reasoning

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Analyze this data..."

}]

)

# Switch to Claude for analysis

response 

=

 client.chat.completions.create(

    model

=

"claude-3.7-sonnet"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Analyze this data..."

}]

)

# Use Claude for creative writing

response 

=

 client.chat.completions.create(

    model

=

"claude-opus-4-1-20250805"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Write a story about..."

}]

)

​

Popular Model Combinations

Use Case

Primary Model

Fallback Models

Why

Chatbots

gpt-4o-mini

gpt-3.5-turbo, claude-3.5-sonnet

Fast, cost-effective

Code Generation

gpt-5

claude-3.7-sonnet, gpt-4o

Specialized for code

Analysis

claude-opus-4-1-20250805

gpt-5, gemini-2.5-pro

Best reasoning

Creative Writing

claude-opus-4-1-20250805

gpt-5, claude-sonnet-4

Creative excellence

​

Getting Started

Ready to get started?
 Head to our 
Quick Start guide
 to make your first API call in minutes.

​

3-Step Setup

Get API Key
: Sign up and get your MegaLLM API key

Choose Format
: Use OpenAI or Anthropic API format

Start Building
: Make your first request to any of 70+ models

​

Need Help?

Browse our guides
: Comprehensive documentation for every feature

Check the FAQ
: Common questions and solutions

Contact support
: 

[email&#160;protected]

 for technical assistance

Use search
: Press Cmd+K to search all docume

...(truncated)

---

## sitemap.xml

> Source: https://docs.megallm.io/sitemap.xml

https://docs.megallm.io/api-reference/chat/create-chat-completion

    
2025-11-17T06:53:04.863Z

  

  

    
https://docs.megallm.io/api-reference/messages/create-message

    
2025-11-17T06:53:04.874Z

  

  

    
https://docs.megallm.io/api-reference/models/list-models

    
2025-11-17T06:53:04.884Z

  

  

    
https://docs.megallm.io/cn/agents/claude

    
  

  

    
https://docs.megallm.io/cn/agents/cline

    
  

  

    
https://docs.megallm.io/cn/agents/codex

    
  

  

    
https://docs.megallm.io/cn/agents/kilocode

    
  

  

    
https://docs.megallm.io/cn/agents/opencode

    
  

  

    
https://docs.megallm.io/cn/agents/overview

    
  

  

    
https://docs.megallm.io/cn/agents/roocode

    
  

  

    
https://docs.megallm.io/cn/api-reference/endpoint/function-calling

    
  

  

    
https://docs.megallm.io/cn/api-reference/endpoint/streaming

    
  

  

    
https://docs.megallm.io/cn/api-reference/introduction

    
  

  

    
https://docs.megallm.io/cn/cli/claude-config

    
  

  

    
https://docs.megallm.io/cn/cli/codex-config

    
  

  

    
https://docs.megallm.io/cn/cli/configuration

    
  

  

    
https://docs.megallm.io/cn/cli/examples

    
2025-11-24T12:50:19.855Z

  

  

    
https://docs.megallm.io/cn/cli/faq

    
  

  

    
https://docs.megallm.io/cn/cli/installation

    
  

  

    
https://docs.megallm.io/cn/cli/opencode-config

    
  

  

    
https://docs.megallm.io/cn/cli/overview

    
  

  

    
https://docs.megallm.io/cn/cli/troubleshooting

    
  

  

    
https://docs.megallm.io/cn/dev-docs/anthropic/messages

    
  

  

    
https://docs.megallm.io/cn/dev-docs/anthropic/overview

    
  

  

    
https://docs.megallm.io/cn/dev-docs/getting-started/authentication

    
  

  

    
https://docs.megallm.io/cn/dev-docs/getting-started/quick-start

    
  

  

    
https://docs.megallm.io/cn/dev-docs/openai/chat-completions

    
  

  

    
https://docs.megallm.io/cn/dev-docs/openai/function-calling

    
  

  

    
https://docs.megallm.io/cn/dev-docs/openai/overview

    
  

  

    
https://docs.megallm.io/cn/dev-docs/openai/streaming

    
  

  

    
https://docs.megallm.io/cn/home/faq

    
  

  

    
https://docs.megallm.io/cn/home/getting-started/first-request

    
  

  

    
https://docs.megallm.io/cn/home/getting-started/next-steps

    
  

  

    
https://docs.megallm.io/cn/home/getting-started/overview

    
  

  

    
https://docs.megallm.io/cn/home/getting-started/quick-start

    
  

  

    
https://docs.megallm.io/cn/home/getting-started/setup

    
  

  

    
https://docs.megallm.io/cn/home/introduction

    
  

  

    
https://docs.megallm.io/cn/home/models

    
  

  

    
https://docs.megallm.io/cn/releases/overview

    
  

  

    
https://docs.megallm.io/cn/resources/overview

    
  

  

    
https://docs.megallm.io/en/agents/claude

    
  

  

    
https://docs.megallm.io/en/agents/cline

    
  

  

    
https://docs.megallm.io/en/agents/codex

    
  

  

    
https://docs.megallm.io/en/agents/kilocode

    
  

  

    
https://docs.megallm.io/en/agents/opencode

    
  

  

    
https://docs.megallm.io/en/agents/overview

    
  

  

    
https://docs.megallm.io/en/agents/roocode

    
  

  

    
https://docs.megallm.io/en/api-reference/endpoint/function-calling

    
  

  

    
https://docs.megallm.io/en/api-reference/endpoint/streaming

    
  

  

    
https://docs.megallm.io/en/api-reference/introduction

    
  

  

    
https://docs.megallm.io/en/cli/claude-config

    
  

  

    
https://docs.megallm.io/en/cli/codex-config

    
  

  

    
https://docs.megallm.io/en/cli/configuration

    
  

  

    
https://docs.megallm.io/en/cli/examples

    
2025-11-24T12:50:20.863Z

  

  

    
https://docs.megallm.io/en/cli/faq

    
  

  

    
https://docs.megallm.io/en/cli/installation

    
  

  

    
https://docs.megallm.io/en/cli/opencode-config

    
  

  

    


...(truncated)

---

## Quick Start - MegaLLM

> Source: https://docs.megallm.io/en/dev-docs/getting-started/quick-start

Quick Start - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Quick Start

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

Quick Start

Authentication

OpenAI API

OpenAI API

Chat Completions

Streaming

Function Calling

Anthropic API

Anthropic API

Messages

On this page

Installation

Next Steps

Common Issues

Prerequisites
: You’ll need a MegaLLM API key to use our services.

​

Installation

1

Get Your API Key

First, you’ll need to obtain your MegaLLM API key. This key will be used to authenticate all your API requests.

Copy

Ask AI

export

 MEGALLM_API_KEY

=

"your-api-key"

See our 
Authentication Guide
 for detailed instructions on obtaining your API key.

2

Choose Your API Format

MegaLLM supports both OpenAI and Anthropic API formats. Choose the one that best fits your needs:

 
OpenAI Format

 
Anthropic Format

Set your base URL to use OpenAI-compatible endpoints:

Copy

Ask AI

export

 MEGALLM_BASE_URL

=

"https://ai.megallm.io/v1"

# Use your MegaLLM API key

export

 MEGALLM_API_KEY

=

"your-api-key"

Set your base URL to use Anthropic-compatible endpoints:

Copy

Ask AI

export

 ANTHROPIC_BASE_URL

=

"https://ai.megallm.io"

export

 ANTHROPIC_API_KEY

=

$MEGALLM_API_KEY

3

Make Your First Request

Now you’re ready to make your first API call!

cURL

Python

JavaScript

Go

Copy

Ask AI

curl

 https://ai.megallm.io/v1/chat/completions

 \

  -H

 "Authorization: Bearer 

$MEGALLM_API_KEY

"

 \

  -H

 "Content-Type: application/json"

 \

  -d

 &#x27;{

    "model": "gpt-4",

    "messages": [

      {

        "role": "user",

        "content": "Hello! Can you introduce yourself?"

      }

    ],

    "max_tokens": 100

  }&#x27;

4

Verify Your Setup

If everything is set up correctly, you should receive a response like this:

Copy

Ask AI

{

  "id"

: 

"chatcmpl-123"

,

  "object"

: 

"chat.completion"

,

  "created"

: 

1677652288

,

  "model"

: 

"gpt-4"

,

  "choices"

: [

    {

      "index"

: 

0

,

      "message"

: {

        "role"

: 

"assistant"

,

        "content"

: 

"Hello! I&#x27;m an AI assistant powered by MegaLLM..."

      },

      "finish_reason"

: 

"stop"

    }

  ],

  "usage"

: {

    "prompt_tokens"

: 

10

,

    "completion_tokens"

: 

25

,

    "total_tokens"

: 

35

  }

}

​

Next Steps

Authentication

Learn about authentication methods and API key management

OpenAI API

Explore the OpenAI-compatible endpoints

Anthropic API

Discover Anthropic Claude API features

Best Practices

Common questions and best practices

​

Common Issues

Rate Limiting
: If you encounter rate limit errors, check our 
FAQ
 for guidance.

Authentication Failed
: Make sure your API key is valid and has the necessary permissions. Check our 
Authentication Guide
 for solutions.

Was this page helpful?

Yes

No

Authentication

⌘
I

---

## CLI Overview - MegaLLM

> Source: https://docs.megallm.io/en/cli/overview

CLI Overview - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

CLI Overview

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

CLI Overview

Installation

Configuration

Configuration Overview

Claude Code Configuration

Codex/Windsurf Configuration

OpenCode Configuration

Guides

Usage Examples

Troubleshooting

FAQ

On this page

Quick Start

What It Does

Supported Tools

Key Features

How It Works

Setup Levels

System-Level (Global)

Project-Level (Local)

Requirements

Installation Options

NPX (Recommended)

Global Installation

Specific Version

First-Time Setup Example

Getting Your API Key

What’s Next?

Quick Links

Support

​

Quick Start

Get started in seconds:

Copy

Ask AI

npx

 megallm@latest

That’s it! The interactive wizard guides you through the entire setup process.

No installation required - just run 
npx megallm@latest
 and follow the prompts

​

What It Does

The CLI automatically:

Detects
 installed AI tools and your system configuration

Installs
 missing tools if needed (with your permission)

Configures
 AI assistants with your MegaLLM API key

Backs up
 existing configurations before making changes

Validates
 settings to ensure everything works correctly

​

Supported Tools

Claude Code

System & project-level configuration

Codex/Windsurf

System-level configuration

OpenCode

System & project-level configuration

​

Key Features

Smart Detection

Auto-detects OS, shell, installed tools, and existing configurations

Automated Setup

Interactive wizard with step-by-step guidance

Secure Storage

Automatic backups and secure API key management

Cross-Platform

Works on macOS, Linux, Windows with all major shells

​

How It Works

1

Run the CLI

Execute 
npx megallm@latest
 in your terminal

2

System Detection

CLI detects your OS, shell, and installed AI tools

3

Choose Configuration

Select which tool(s) to configure and at what level (system/project)

4

Enter API Key

Provide your MegaLLM API key (or get guided to create one)

5

Review & Confirm

Review configuration summary and confirm

6

Apply Settings

CLI configures files, sets environment variables, and reloads shell

​

Setup Levels

Choose between two configuration levels:

​

System-Level (Global)

Applies to 
all projects
 on your machine.

Best for:

Personal development environments

Single developer setups

Quick testing and prototyping

Storage:

~/.claude/
 - Claude Code

~/.codex/
 - Codex/Windsurf

~/.config/opencode/
 - OpenCode

​

Project-Level (Local)

Applies 
only to the current project
 directory.

Best for:

Team projects with shared configurations

Different API keys per project

Version-controlled settings

Storage:

./.claude/
 - Claude Code

./opencode.json
 - OpenCode

Codex/Windsurf only supports system-level configuration

​

Requirements

Node.js 18.0.0+
 is required. Check your version: 
node --version

Supported Platforms:

macOS (Intel & Apple Silicon)

Linux (all major distributions)

Windows (10/11 with WSL or native)

Supported Shells:

bash

zsh

fish

PowerShell

​

Installation Options

​

NPX (Recommended)

No installation needed:

Copy

Ask AI

npx

 megallm@latest

​

Global Installation

Install once, use anytime:

Copy

Ask AI

npm

 install

 -g

 megallm

megallm

​

Specific Version

Run a specific version:

Copy

Ask AI

npx

 
[email&#160;protected]

​

First-Time Setup Example

Copy

Ask AI

# Run the CLI

npx

 megallm@latest

# Interactive prompts:

# ✓ System detected: Linux (bash)

# ✓ Tools detected: Claude Code ✓, Codex ✗

#

# ? Which tool? › Claude Code

# ? Setup level? › System-level (global)

# ? Enter API key: sk-mega-***

#

# ✓ Configuration applied successfully!

# 🎉 Ready to use Claude Code with MegaLLM

​

Getting Your API Key

1

Visit Dashboard

Go to 
megallm.io/dashboard

2

Sign Up or Log In

Create an account or log

...(truncated)

---

## AI Coding Agents Overview - MegaLLM

> Source: https://docs.megallm.io/en/agents/overview

AI Coding Agents Overview - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

AI Coding Agents Overview

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

AI Coding Agents Overview

Configuration

Claude Code Configuration

Codex/Windsurf Configuration

OpenCode Configuration

Kilocode Configuration

RooCode Configuration

Cline Configuration

On this page

Available Agents

Quick Comparison

Agent Types

CLI-First Agents (with Editor Support)

Editor-Only Agents (CLI Coming Soon)

Getting Started

Configuration Guides

CLI-First Agents (also work in editors)

Editor-Only Agents

Model Selection

GPT Models

Claude Models

Gemini Models

Environment Variables

Common Configuration Patterns

Pattern 1: System-Level for Personal Use

Pattern 2: Project-Level for Teams

Pattern 3: Multi-Model Configuration

Troubleshooting

Feature Comparison

Interfaces & Usage

Integrations

Configuration Flexibility

Best Practices

Next Steps

MegaLLM supports all major AI coding agents. This unified guide covers configuration for Claude Code, Codex/Windsurf, OpenCode, Kilocode, RooCode, and Cline.

​

Available Agents

Claude Code

CLI + Editor integration with JSON config

Codex/Windsurf

CLI + Editor with TOML config

OpenCode

CLI + Editor with auto-model fetching

Kilocode

VSCode extension with inline chat (CLI coming soon)

RooCode

Standalone app with visual interface

Cline

VSCode extension with autonomous tasks (CLI coming soon)

​

Quick Comparison

Agent

Interfaces

Config Format

Config Level

Best For

Claude Code

CLI + VSCode

JSON

System + Project

Terminal workflows, VSCode integration

Codex/Windsurf

CLI + Editor

TOML

System only

Advanced users, Cascade AI

OpenCode

CLI + Editor

JSON

System + Project

Multi-model switching, flexibility

Kilocode

VSCode (CLI soon)

VSCode settings

User + Workspace

Inline chat, code completion

RooCode

Standalone app

JSON

App-level

Visual UI, standalone workflow

Cline

VSCode (CLI soon)

VSCode settings

User + Workspace

Autonomous tasks, terminal ops

​

Agent Types

​

CLI-First Agents (with Editor Support)

Claude Code

CLI-first design

VSCode extension available

JSON configuration

System & project-level

Statusline support

Codex/Windsurf

CLI-first design

Editor integrations

TOML configuration

Cascade AI (Windsurf)

Supercomplete features

OpenCode

CLI-first design

Editor plugins available

JSON configuration

Auto-fetch models

Multi-provider support

When to use CLI-first agents:

Terminal-based workflows

CI/CD integration

Server environments

Scripting and automation

Also work great in editors with extensions

​

Editor-Only Agents (CLI Coming Soon)

Kilocode

VSCode extension (primary)

CLI under maintenance

Inline chat interface

Code completion

File tree integration

RooCode

Standalone app

Visual interface

Multi-project support

Code review features

Cline

VSCode extension (primary)

CLI under maintenance

Autonomous task execution

Terminal integration

Git workflow support

CLI Support for Kilocode & Cline:
 CLI versions are currently under maintenance and will be available soon. Use the VSCode extensions in the meantime.

When to use editor-focused agents:

Pure visual editing workflows

Inline suggestions and completions

Multi-file refactoring

Code review workflows

IDE-native experience

​

Getting Started

1

Choose Your Agent

Select a CLI agent for terminal workflows or a GUI agent for visual editing

2

Get Your API Key

Sign up at 
MegaLLM Dashboard
 and get your API key starting with 
sk-mega-

3

Configure Your Agent

Follow the specific configuration guide for your chosen agent (linked below)

4

Start Coding

Launch your agent and start using AI-powered coding assistance

​

Configuration Guides

​

CLI-First Agents (also work in editors)

Claude Code - CLI + VSCode

Works as:
 CLI tool + VSCode exten

...(truncated)

---

## API Reference - MegaLLM

> Source: https://docs.megallm.io/en/api-reference/introduction

API Reference - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

API Reference

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

API Reference

Chat & Messages

POST

Create chat completion

POST

Create message

Models

GET

List models

Guides

Streaming

Function Calling

On this page

Base URLs

Authentication

Bearer Token (Recommended)

API Key Header (Anthropic Format)

Core Endpoints

Advanced Features

Quick Start

Rate Limits

SDK Support

Need Help?

​

Base URLs

MegaLLM supports two API formats:

OpenAI Format

Copy

Ask AI

https://ai.megallm.io/v1

Compatible with OpenAI SDKs and tools

Anthropic Format

Copy

Ask AI

https://ai.megallm.io

Compatible with Anthropic Claude SDKs

​

Authentication

All API endpoints require authentication using one of these methods:

​

Bearer Token (Recommended)

Copy

Ask AI

Authorization

:

 Bearer YOUR_API_KEY

​

API Key Header (Anthropic Format)

Copy

Ask AI

x-api-key

:

 YOUR_API_KEY

anthropic-version

:

 2023-06-01

Get your API key from the 
MegaLLM Dashboard
.

​

Core Endpoints

Chat Completions

OpenAI-compatible chat API with streaming, function calling, and vision support

Messages

Anthropic-compatible API with extended thinking, tools, and prompt caching

Models

List all 70+ AI models with capabilities, pricing, and context windows

​

Advanced Features

Streaming

Real-time streaming responses with Server-Sent Events

Function Calling

Enable AI to interact with external tools and APIs

Authentication Guide

Comprehensive authentication methods and security best practices

​

Quick Start

 
Python

 
JavaScript

 
cURL

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

Copy

Ask AI

import

 OpenAI

 from

 &#x27;openai&#x27;

;

const

 openai

 =

 new

 OpenAI

({

  baseURL:

 &#x27;https://ai.megallm.io/v1&#x27;

,

  apiKey:

 process

.

env

.

MEGALLM_API_KEY

,

});

const

 response

 =

 await

 openai

.

chat

.

completions

.

create

({

  model:

 &#x27;gpt-4&#x27;

,

  messages:

 [{ 

role:

 &#x27;user&#x27;

, 

content:

 &#x27;Hello!&#x27;

 }]

});

Copy

Ask AI

curl

 https://ai.megallm.io/v1/chat/completions

 \

  -H

 "Authorization: Bearer 

$MEGALLM_API_KEY

"

 \

  -H

 "Content-Type: application/json"

 \

  -d

 &#x27;{

    "model": "gpt-4",

    "messages": [{"role": "user", "content": "Hello!"}]

  }&#x27;

​

Rate Limits

Rate limits vary by plan tier:

Tier

Requests/min

Tokens/min

Concurrent

Basic

60

90K

10

Pro

300

450K

40

Enterprise

Custom

Custom

Custom

​

SDK Support

MegaLLM is compatible with popular AI SDKs:

Python
: 
openai
, 
anthropic
, 
langchain

JavaScript/TypeScript
: 
openai
, 
@anthropic-ai/sdk

Go
: 
go-openai

Ruby
: 
anthropic-rb

Rust
: 
async-openai

Java
: 
openai-java

C#
: 
OpenAI-DotNet

​

Need Help?

Developer Docs

Comprehensive guides and tutorials

Models Catalog

Browse all 70+ available models

Was this page helpful?

Yes

No

Create chat completion

⌘
I

---

## Resources - MegaLLM

> Source: https://docs.megallm.io/en/resources/overview

Resources - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Community

Resources

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Community

Resources

On this page

Community

External Resources

​

Community

Discord Community

Join our Discord community for support and discussions

GitHub

Explore our open-source projects and examples

​

External Resources

Dashboard

YouTube Channel

Twitter/X

Have questions? Visit our 
FAQ
 or reach out to 

[email&#160;protected]

Was this page helpful?

Yes

No

⌘
I

---

## Release Notes - MegaLLM

> Source: https://docs.megallm.io/en/releases/overview

Release Notes - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Updates

Release Notes

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Updates

Release Notes

On this page

Latest Updates

Stay Informed

Subscribe to Updates

​

Latest Updates

Coming Soon
: Detailed release notes and changelog will be available here.

​

Stay Informed

Follow us on 
Twitter/X
 for announcements

Join our 
Discord
 for early access to new features

Check the 
Dashboard
 for service status

​

Subscribe to Updates

Sign up for email notifications about new releases and important updates at 
megallm.io
.

Was this page helpful?

Yes

No

⌘
I

---

## Models Catalog - MegaLLM

> Source: https://docs.megallm.io/en/home/models

Models Catalog - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

Models Catalog

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

Live Models Data

Model Selection Guide

By Use Case

By Budget

Using Models in Code

Automatic Fallback

Pricing Calculator

Next Steps

​

Live Models Data

The models catalog is dynamically updated. Visit our 
dashboard
 for real-time pricing and availability.

​

Model Selection Guide

​

By Use Case

Fast Responses

gpt-5-mini, gpt-4o-mini, gemini-2.0-flash-001, gpt-3.5-turbo

Complex Reasoning

gpt-5, claude-opus-4-1-20250805, gemini-2.5-pro

Cost-Effective

gpt-4o-mini, gemini-2.0-flash-001

Large Context

gpt-4.1 (1M+), gemini-2.5-pro (1M+)

Vision Tasks

gpt-5, gpt-4o, claude-sonnet-4, gemini models

Code Generation

gpt-5, claude-3.7-sonnet, gpt-4o

​

By Budget

Economy

Models
: 
gpt-4o-mini
, 
gemini-2.0-flash-001

Use Cases
: Prototyping, simple tasks, testing

Cost
: Most affordable option for high-volume usage

Standard

Models
: 
gpt-5-mini
, 
claude-3.5-sonnet

Use Cases
: Production apps, chatbots, customer service

Cost
: Balanced performance and pricing

Premium

Models
: 
gpt-5
, 
claude-sonnet-4

Use Cases
: Advanced reasoning, complex analysis, research

Cost
: Higher tier for demanding applications

Enterprise

Models
: 
claude-opus-4-1-20250805
, 
gpt-4.1

Use Cases
: Critical applications, advanced research, maximum capability

Cost
: Premium pricing for best-in-class performance

​

Using Models in Code

Always use the model ID when making API calls:

Python

JavaScript

cURL

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

# Use model ID, not display name

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,  

# Model ID

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

# Switch to Claude using model ID

response 

=

 client.chat.completions.create(

    model

=

"claude-opus-4-1-20250805"

,  

# Model ID

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

# Try Gemini using model ID

response 

=

 client.chat.completions.create(

    model

=

"gemini-2.5-pro"

,  

# Model ID

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

​

Automatic Fallback

Configure automatic fallback using model IDs:

Copy

Ask AI

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,

    messages

=

messages,

    fallback_models

=

[

"claude-opus-4-1-20250805"

, 

"gemini-2.5-pro"

],

    fallback_on_rate_limit

=

True

,

    fallback_on_error

=

True

)

​

Pricing Calculator

Estimate your costs across different models:

Usage Level

Tokens/Month

gpt-5-mini

claude-3.5-sonnet

gemini-2.0-flash-001

Hobby

1M

$2.25

$18

$0.75

Startup

10M

$22.50

$180

$7.50

Business

100M

$225

$1,800

$75

Enterprise

1B+

Custom

Custom

Custom

Important
: Model IDs are case-sensitive. Always use the exact model ID as shown in the tables above.

​

Next Steps

Read the 
FAQ
 for common questions about model selection

Check out the 
API Reference
 for detailed endpoint documentation

View 
Developer Docs
 for integration guides

Was this page helpful?

Yes

No

MegaLLM Documentation

FAQ

⌘
I

---

## FAQ - MegaLLM

> Source: https://docs.megallm.io/en/home/faq

FAQ - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Overview

FAQ

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

General

Platform Features

Pricing & Billing

Technical Integration

Use Cases

Support & Getting Started

​

General

What is MegaLLM?

MegaLLM is a universal AI platform that connects 70+ large language models from leading providers like OpenAI, Anthropic, and Google through a single API. Think of it as your “super-API” for AI - instead of integrating with multiple providers separately, you get access to all models through one unified interface.

How many models does MegaLLM support?

We currently support 70+ models including:

OpenAI
: gpt-5, gpt-4.1, gpt-4o, gpt-3.5-turbo

Anthropic
: claude-opus-4-1-20250805, claude-sonnet-4, claude-3.5-sonnet, claude-3.7-sonnet

Google
: gemini-2.5-pro, gemini-2.0-flash-001

Embedding Models
: Various text embedding options

New models are added regularly as they become available.

Can I switch between models instantly?

Yes! Switching models is as simple as changing one parameter in your API call. You can also set up automatic fallbacks between models.

Copy

Ask AI

# Switch models instantly

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,  

# Change this to any supported model ID

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

Do I need separate accounts for each AI provider?

No! That’s the beauty of MegaLLM. You only need one MegaLLM account to access all 70+ models. We handle the complexity of managing multiple provider relationships, so you don’t have to.

​

Platform Features

What makes MegaLLM different from using providers directly?

MegaLLM offers several unique advantages:

One API for All
: Access 70+ models through a single, consistent interface

Automatic Fallbacks
: If one model fails, automatically switch to another

Unified Billing
: One invoice for all your AI usage

Performance Optimization
: Intelligent routing and load balancing

Cost Management
: Optimize spending across different models

How do automatic fallbacks work?

When you configure fallback models, MegaLLM automatically routes your request to backup models if the primary model encounters issues like:

Rate limits

Temporary outages

Timeout errors

Capacity constraints

This ensures your application never goes down due to a single model failure.

Copy

Ask AI

response 

=

 client.chat.completions.create(

    model

=

"gpt-5"

,

    messages

=

messages,

    fallback_models

=

[

"claude-opus-4-1-20250805"

, 

"gemini-2.5-pro"

]

)

​

Pricing & Billing

How does pricing work?

You pay based on actual token usage, just like with individual providers. However, MegaLLM offers several advantages:

Unified Billing
: One invoice for all models

Volume Discounts
: Better rates for high usage

Cost Optimization
: Tools to minimize spending

Transparent Pricing
: Clear cost breakdown by model

See our 
Models page
 for detailed pricing information.

Is MegaLLM more expensive than using providers directly?

For most users, MegaLLM offers better value because:

Volume Pricing
: We pass on volume discounts to customers

Reduced Development Costs
: No need to integrate with multiple APIs

Operational Savings
: Less monitoring, fewer rate limit issues

Fallback Benefits
: Higher uptime means less lost revenue

Plus, you save significant engineering time by not having to manage multiple provider integrations.

Can I set spending limits?

Yes! MegaLLM provides comprehensive cost controls:

Daily/monthly spending limits

Per-model budget allocation

Usage alerts and notifications

Cost optimization recommendations

Automatic fallback to cheaper models when limits are reached


...(truncated)

---

## Getting Started - MegaLLM

> Source: https://docs.megallm.io/en/home/getting-started/overview

Getting Started - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Getting Started

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

Quick Navigation

What is MegaLLM?

Supported Models

Why Choose MegaLLM?

3-Step Setup

Choose Your Path

Next Steps

Need Help?

​

Quick Navigation

Quick Start

Make your first API call in 2 minutes

Setup Guide

Complete setup and configuration

First Request

Your first AI request step-by-step

Next Steps

What to do after getting started

​

What is MegaLLM?

MegaLLM is a universal AI platform that provides access to 70+ large language models through a single API. Instead of managing multiple API keys and integrations, you get:

One API
 for all models

One bill
 for all usage

One integration
 to maintain

​

Supported Models

OpenAI
: GPT-4, GPT-5, GPT-3.5 Turbo

Anthropic
: Claude Opus 4, Claude Sonnet, Claude Haiku

Google
: Gemini 2.5 Pro, Gemini Flash

Meta
: Llama 3 70B, Llama 3 8B

And 60+ more models!

​

Why Choose MegaLLM?

Universal Access

Access all major AI models through one API. No need to integrate with multiple providers separately.

Simple Integration

Drop-in replacement for OpenAI and Anthropic SDKs. Just change the base URL and you’re ready to go.

Automatic Fallbacks

Built-in failover ensures your application keeps running even when a model is down.

Cost Optimization

Easily switch between models to optimize for cost, speed, or quality without code changes.

One Bill

Unified billing across all providers. Track usage and costs in one dashboard.

​

3-Step Setup

1

Get API Key

Sign up at 
megallm.io
 and generate your API key

2

Install SDK

Use the OpenAI or Anthropic SDK you already know

Copy

Ask AI

pip

 install

 openai

# or

pip

 install

 anthropic

3

Make Request

Point to MegaLLM and start using any model

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-megallm-api-key"

)

​

Choose Your Path

 
I&#x27;m New to AI

 
I Use OpenAI

 
I Use Anthropic

 
I&#x27;m a Developer

Perfect! Start here:

Quick Start Guide
 - Get your API key and make your first request

First Request Tutorial
 - Step-by-step walkthrough

Browse Models
 - Explore available models

FAQ
 - Common questions

Great! Switching is easy:

Get your MegaLLM API key

Change your base URL to 
https://ai.megallm.io/v1

That’s it! All your code works the same

See: 
OpenAI Migration Guide

Awesome! Migration is simple:

Get your MegaLLM API key

Change your base URL to 
https://ai.megallm.io

Done! Use Claude and 70+ other models

See: 
Anthropic Migration Guide

Let’s dive in:

API Reference
 - Complete API docs

OpenAI API
 - OpenAI-compatible endpoints

Anthropic API
 - Anthropic-compatible endpoints

Streaming
 - Real-time responses

Function Calling
 - Tool use

​

Next Steps

Quick Start

Make your first request in 2 minutes

View All Models

Browse 70+ available AI models

Developer Docs

Comprehensive API documentation

CLI Tool

Set up AI coding assistants

​

Need Help?

Documentation
: Complete guides and tutorials

FAQ
: 
Common questions

Support
: 

[email&#160;protected]

Discord
: 
Join our community

Was this page helpful?

Yes

No

FAQ

Quick Start

⌘
I

---

## Quick Start - MegaLLM

> Source: https://docs.megallm.io/en/home/getting-started/quick-start

Quick Start - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Quick Start

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

1. Get Your API Key

2. Make Your First Request

3. Try Different Models

What’s Next?

Common Questions

Need Help?

​

1. Get Your API Key

1

Sign Up

Visit 
megallm.io/auth/signup
 and create an account

2

Navigate to Dashboard

Go to 
megallm.io/dashboard

3

Generate API Key

Click “Create New API Key” in the API Keys section

4

Copy Key

Copy your key (starts with 
sk-mega-
) and save it securely

Keep your API key secret! Never commit it to version control or share it publicly.

​

2. Make Your First Request

Choose your preferred method:

 
Python

 
JavaScript

 
cURL

 
CLI

Copy

Ask AI

# Install OpenAI SDK

pip

 install

 openai

Copy

Ask AI

from

 openai 

import

 OpenAI

# Initialize client

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-megallm-api-key"

  # Replace with your key

)

# Make a request

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[

        {

"role"

: 

"user"

, 

"content"

: 

"Say hello!"

}

    ]

)

print

(response.choices[

0

].message.content)

Copy

Ask AI

# Install OpenAI SDK

npm

 install

 openai

Copy

Ask AI

import

 OpenAI

 from

 &#x27;openai&#x27;

;

// Initialize client

const

 client

 =

 new

 OpenAI

({

  baseURL:

 &#x27;https://ai.megallm.io/v1&#x27;

,

  apiKey:

 &#x27;your-megallm-api-key&#x27;

 // Replace with your key

});

// Make a request

const

 response

 =

 await

 client

.

chat

.

completions

.

create

({

  model:

 &#x27;gpt-4&#x27;

,

  messages:

 [

    { 

role:

 &#x27;user&#x27;

, 

content:

 &#x27;Say hello!&#x27;

 }

  ]

});

console

.

log

(

response

.

choices

[

0

].

message

.

content

);

Copy

Ask AI

curl

 https://ai.megallm.io/v1/chat/completions

 \

  -H

 "Authorization: Bearer YOUR_MEGALLM_API_KEY"

 \

  -H

 "Content-Type: application/json"

 \

  -d

 &#x27;{

    "model": "gpt-4",

    "messages": [

      {"role": "user", "content": "Say hello!"}

    ]

  }&#x27;

Copy

Ask AI

# Install MegaLLM CLI

npx

 megallm@latest

# Follow the interactive setup

See 
CLI Documentation
 for details.

​

3. Try Different Models

One of MegaLLM’s superpowers is instant model switching. Just change the 
model
 parameter:

Copy

Ask AI

# Try GPT-4

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Explain quantum computing"

}]

)

# Switch to Claude

response 

=

 client.chat.completions.create(

    model

=

"claude-opus-4-1-20250805"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Explain quantum computing"

}]

)

# Try Gemini

response 

=

 client.chat.completions.create(

    model

=

"gemini-2.5-pro"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Explain quantum computing"

}]

)

Browse all available models at 
Models Catalog

​

What’s Next?

Complete Setup

Environment variables and configuration

First Request Tutorial

Detailed walkthrough with examples

Browse Models

Explore all 70+ available models

API Reference

Complete API documentation

​

Common Questions

Which model should I use?

Start with 
gpt-4
 for general use, 
claude-3.5-sonnet
 for long context, or 
gpt-3.5-turbo
 for speed and cost efficiency.

See 
Models Catalog
 for detailed comparisons.

How much does it cost?

You pay only for what you use. Different models have different pricing. Most testing can be done for under $1.

Check current pricing in your 
Dashboard
.

Can I use my existing OpenAI/Anthropic co

...(truncated)

---

## Setup Guide - MegaLLM

> Source: https://docs.megallm.io/en/home/getting-started/setup

Setup Guide - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Setup Guide

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

Environment Setup

1. Store Your API Key Securely

2. Install SDK

3. Configure Your Client

Project Setup

For New Projects

For Existing Projects

IDE Setup

VS Code

PyCharm / IntelliJ

AI Coding Assistants

Verify Setup

Troubleshooting

Next Steps

​

Environment Setup

​

1. Store Your API Key Securely

 
Linux/macOS

 
Windows

 
.env File

Add to your shell configuration file:

Copy

Ask AI

# ~/.bashrc or ~/.zshrc

export

 MEGALLM_API_KEY

=

"your-api-key-here"

Then reload:

Copy

Ask AI

source

 ~/.bashrc

# or

source

 ~/.zshrc

Or use a 
.env
 file:

Copy

Ask AI

echo

 "MEGALLM_API_KEY=your-api-key-here"

 >>

 .env

PowerShell:

Copy

Ask AI

[

System.Environment

]::SetEnvironmentVariable(

"MEGALLM_API_KEY"

,

 "your-api-key-here"

,

 "User"

)

Command Prompt:

Copy

Ask AI

setx MEGALLM_API_KEY 

"your-api-key-here"

Create a 
.env
 file in your project root:

Copy

Ask AI

MEGALLM_API_KEY

=

your-api-key-here

Python:

Copy

Ask AI

from

 dotenv 

import

 load_dotenv

load_dotenv()

JavaScript:

Copy

Ask AI

require

(

&#x27;dotenv&#x27;

).

config

();

Add 
.env
 to your 
.gitignore
 to avoid committing secrets!

​

2. Install SDK

 
Python

 
JavaScript/TypeScript

 
Go

 
Other Languages

Copy

Ask AI

# OpenAI SDK (recommended)

pip

 install

 openai

# Or Anthropic SDK

pip

 install

 anthropic

# For environment variables

pip

 install

 python-dotenv

Copy

Ask AI

# OpenAI SDK (recommended)

npm

 install

 openai

# Or Anthropic SDK

npm

 install

 @anthropic-ai/sdk

# For environment variables

npm

 install

 dotenv

Copy

Ask AI

go

 get

 github.com/sashabaranov/go-openai

MegaLLM works with any HTTP client. See 
API Reference
 for details.

​

3. Configure Your Client

 
Python - OpenAI Format

 
Python - Anthropic Format

 
JavaScript - OpenAI Format

 
JavaScript - Anthropic Format

Copy

Ask AI

import

 os

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

# Test the connection

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

print

(response.choices[

0

].message.content)

Copy

Ask AI

import

 os

from

 anthropic 

import

 Anthropic

client 

=

 Anthropic(

    base_url

=

"https://ai.megallm.io"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

# Test the connection

message 

=

 client.messages.create(

    model

=

"claude-3.5-sonnet"

,

    max_tokens

=

100

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

print

(message.content[

0

].text)

Copy

Ask AI

import

 OpenAI

 from

 &#x27;openai&#x27;

;

const

 client

 =

 new

 OpenAI

({

  baseURL:

 &#x27;https://ai.megallm.io/v1&#x27;

,

  apiKey:

 process

.

env

.

MEGALLM_API_KEY

});

// Test the connection

const

 response

 =

 await

 client

.

chat

.

completions

.

create

({

  model:

 &#x27;gpt-4&#x27;

,

  messages:

 [{ 

role:

 &#x27;user&#x27;

, 

content:

 &#x27;Hello!&#x27;

 }]

});

console

.

log

(

response

.

choices

[

0

].

message

.

content

);

Copy

Ask AI

import

 Anthropic

 from

 &#x27;@anthropic-ai/sdk&#x27;

;

const

 client

 =

 new

 Anthropic

({

  baseURL:

 &#x27;https://ai.megallm.io&#x27;

,

  apiKey:

 process

.

env

.

MEGALLM_API_KEY

});

// Test the connection

const

 message

 =

 await

 client

.

messages

.

create

({

  model:

 &#x27;claude-3.5-sonnet&#x27;

,

  max_token

...(truncated)

---

## First Request - MegaLLM

> Source: https://docs.megallm.io/en/home/getting-started/first-request

First Request - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

First Request

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

Prerequisites

Step 1: Create Project

Step 2: Store API Key

Step 3: Basic Request

Step 4: Add Conversation Context

Step 5: Try Different Models

Step 6: Add Parameters

Step 7: Error Handling

Step 8: Interactive Chat

Understanding the Response

Next Steps

Troubleshooting

Need Help?

​

Prerequisites

MegaLLM API key (
Get one here
)

Python 3.7+ or Node.js 14+ installed

Basic programming knowledge

​

Step 1: Create Project

 
Python

 
JavaScript

Copy

Ask AI

# Create directory

mkdir

 my-first-ai-app

cd

 my-first-ai-app

# Create virtual environment

python

 -m

 venv

 venv

source

 venv/bin/activate

  # On Windows: venv\Scripts\activate

# Install dependencies

pip

 install

 openai

 python-dotenv

Copy

Ask AI

# Create directory

mkdir

 my-first-ai-app

cd

 my-first-ai-app

# Initialize project

npm

 init

 -y

# Install dependencies

npm

 install

 openai

 dotenv

​

Step 2: Store API Key

Create a 
.env
 file:

Copy

Ask AI

MEGALLM_API_KEY

=

your-api-key-here

Add 
.env
 to 
.gitignore
 to avoid committing your API key!

​

Step 3: Basic Request

 
Python

 
JavaScript

Create 
app.py
:

Copy

Ask AI

import

 os

from

 dotenv 

import

 load_dotenv

from

 openai 

import

 OpenAI

# Load environment variables

load_dotenv()

# Initialize client

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

# Make a request

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[

        {

"role"

: 

"user"

, 

"content"

: 

"What is MegaLLM?"

}

    ]

)

# Print response

print

(response.choices[

0

].message.content)

Run it:

Copy

Ask AI

python

 app.py

Create 
app.js
:

Copy

Ask AI

import

 OpenAI

 from

 &#x27;openai&#x27;

;

import

 dotenv

 from

 &#x27;dotenv&#x27;

;

// Load environment variables

dotenv

.

config

();

// Initialize client

const

 client

 =

 new

 OpenAI

({

  baseURL:

 &#x27;https://ai.megallm.io/v1&#x27;

,

  apiKey:

 process

.

env

.

MEGALLM_API_KEY

});

// Make a request

const

 response

 =

 await

 client

.

chat

.

completions

.

create

({

  model:

 &#x27;gpt-4&#x27;

,

  messages:

 [

    { 

role:

 &#x27;user&#x27;

, 

content:

 &#x27;What is MegaLLM?&#x27;

 }

  ]

});

// Print response

console

.

log

(

response

.

choices

[

0

].

message

.

content

);

Update 
package.json
:

Copy

Ask AI

{

  "type"

: 

"module"

}

Run it:

Copy

Ask AI

node

 app.js

​

Step 4: Add Conversation Context

Let’s make it conversational:

 
Python

 
JavaScript

Copy

Ask AI

import

 os

from

 dotenv 

import

 load_dotenv

from

 openai 

import

 OpenAI

load_dotenv()

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

# Conversation history

messages 

=

 [

    {

"role"

: 

"system"

, 

"content"

: 

"You are a helpful assistant."

},

    {

"role"

: 

"user"

, 

"content"

: 

"What is Python?"

}

]

# First response

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

messages

)

# Add to history

assistant_message 

=

 response.choices[

0

].message.content

messages.append({

"role"

: 

"assistant"

, 

"content"

: assistant_message})

print

(

f

"Assistant: 

{

assistant_message

}

\n

"

)

# Follow-up question

messages.append({

"role"

: 

"user"

, 

"content"

: 

"What are its key features?"

})

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

...(truncated)

---

## Next Steps - MegaLLM

> Source: https://docs.megallm.io/en/home/getting-started/next-steps

Next Steps - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Next Steps

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

On this page

Learn Advanced Features

Explore Documentation

Build Real Applications

1. Chatbot

2. Content Generator

3. Code Assistant

4. Data Analyzer

Best Practices

Production Considerations

Security

Performance

Monitoring

Scaling

Join the Community

Get Help

Useful Resources

Ready to Build?

​

Learn Advanced Features

Streaming Responses

Get real-time responses as they’re generated

Function Calling

Let AI interact with external tools and APIs

Vision Support

Process images with multimodal models

API Documentation

Complete API reference and guides

​

Explore Documentation

API Reference

Complete API documentation

OpenAI API

OpenAI-compatible endpoints

Anthropic API

Anthropic Claude-compatible endpoints

Models Catalog

Browse all 70+ available models

​

Build Real Applications

​

1. Chatbot

Build an intelligent chatbot:

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-key"

)

def

 chatbot

(

user_message

, 

history

=

[]):

    history.append({

"role"

: 

"user"

, 

"content"

: user_message})

    response 

=

 client.chat.completions.create(

        model

=

"gpt-4"

,

        messages

=

history

    )

    assistant_message 

=

 response.choices[

0

].message.content

    history.append({

"role"

: 

"assistant"

, 

"content"

: assistant_message})

    return

 assistant_message, history

​

2. Content Generator

Generate blog posts, emails, or social media content:

Copy

Ask AI

def

 generate_content

(

topic

, 

content_type

=

"blog"

):

    prompts 

=

 {

        "blog"

: 

f

"Write a comprehensive blog post about 

{

topic

}

"

,

        "email"

: 

f

"Write a professional email about 

{

topic

}

"

,

        "tweet"

: 

f

"Write an engaging tweet about 

{

topic

}

"

    }

    response 

=

 client.chat.completions.create(

        model

=

"claude-3.5-sonnet"

,

        messages

=

[{

"role"

: 

"user"

, 

"content"

: prompts[content_type]}],

        temperature

=

0.7

    )

    return

 response.choices[

0

].message.content

​

3. Code Assistant

Build a coding helper:

Copy

Ask AI

def

 code_assistant

(

task

, 

language

=

"python"

):

    prompt 

=

 f

"Write 

{

language

}

 code to 

{

task

}

. Include comments and error handling."

    response 

=

 client.chat.completions.create(

        model

=

"gpt-4"

,

        messages

=

[{

"role"

: 

"user"

, 

"content"

: prompt}],

        temperature

=

0.2

  # Lower temperature for more deterministic code

    )

    return

 response.choices[

0

].message.content

​

4. Data Analyzer

Analyze data and generate insights:

Copy

Ask AI

def

 analyze_data

(

data_description

):

    prompt 

=

 f

"""

    Analyze this data and provide insights:

    {

data_description

}

    Provide:

    1. Key findings

    2. Trends

    3. Recommendations

    """

    response 

=

 client.chat.completions.create(

        model

=

"claude-opus-4-1-20250805"

,  

# Best for analysis

        messages

=

[{

"role"

: 

"user"

, 

"content"

: prompt}]

    )

    return

 response.choices[

0

].message.content

​

Best Practices

Choose the Right Model

GPT-4
: Best for complex reasoning

GPT-3.5 Turbo
: Fast and cost-effective

Claude Opus
: Excellent for analysis and long context

Claude Sonnet
: Balanced performance

Gemini Pro
: Strong multimodal capabilities

See 
Models Catalog
 for detailed comparisons.

Optimize Costs

Start with cheaper models for testing

Use 
max_t

...(truncated)

---

## OpenAI API - MegaLLM

> Source: https://docs.megallm.io/en/dev-docs/openai/overview

OpenAI API - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

OpenAI API

OpenAI API

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

Quick Start

Authentication

OpenAI API

OpenAI API

Chat Completions

Streaming

Function Calling

Anthropic API

Anthropic API

Messages

On this page

Available Endpoints

Quick Example

Supported Models

Features

Full Compatibility

High Performance

Usage Tracking

SDK Support

Rate Limits

Migration Guide

Error Handling

Next Steps

Base URL
: 
https://ai.megallm.io/v1
 for all OpenAI-compatible endpoints

​

Available Endpoints

Chat Completions

Generate conversational responses with GPT models

Streaming

Real-time streaming responses with Server-Sent Events

Function Calling

Execute functions and tools with parallel support

Models

Browse available models and capabilities

​

Quick Example

Copy

Ask AI

from

 openai 

import

 OpenAI

# Initialize client

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

# Simple chat completion

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[

        {

"role"

: 

"system"

, 

"content"

: 

"You are a helpful assistant."

},

        {

"role"

: 

"user"

, 

"content"

: 

"Explain quantum computing in simple terms."

}

    ],

    temperature

=

0.7

,

    max_tokens

=

150

)

print

(response.choices[

0

].message.content)

​

Supported Models

Model

Context Window

Use Case

gpt-4

8,192 tokens

Complex reasoning, analysis

gpt-4-32k

32,768 tokens

Long documents, extensive context

gpt-4-turbo

128,000 tokens

Large-scale processing

gpt-3.5-turbo

16,385 tokens

Fast, cost-effective responses

​

Features

​

Full Compatibility

Drop-in replacement for OpenAI API - use your existing code without changes.

​

High Performance

Fast response times with optimized infrastructure.

​

Usage Tracking

Monitor your API usage and costs.

​

SDK Support

MegaLLM works with all OpenAI-compatible SDKs:

Python
: 
openai
 official SDK

Node.js
: 
openai
 official SDK

Go
: 
go-openai

Rust
: 
async-openai

Java
: 
openai-java

C#
: 
OpenAI-DotNet

​

Rate Limits

Tier

Requests/min

Tokens/min

Basic

60

90,000

Pro

300

450,000

Enterprise

Custom

Custom

​

Migration Guide

Migrating from OpenAI to MegaLLM is simple:

Copy

Ask AI

# Before (OpenAI)

client 

=

 OpenAI(

api_key

=

"sk-..."

)

# After (MegaLLM)

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

That’s it! All your existing code continues to work.

​

Error Handling

MegaLLM returns OpenAI-compatible error responses:

Copy

Ask AI

{

  "error"

: {

    "message"

: 

"Invalid request parameter"

,

    "type"

: 

"invalid_request_error"

,

    "param"

: 

"temperature"

,

    "code"

: 

null

  }

}

Pro Tip
: Enable debug mode with 
X-Debug: true
 header to get detailed error information during development.

​

Next Steps

Explore 
Chat Completions
 for conversational AI

Learn about 
Function Calling
 for tool integration

Implement 
Streaming
 for real-time responses

Was this page helpful?

Yes

No

Authentication

Chat Completions

⌘
I

---

## Anthropic API - MegaLLM

> Source: https://docs.megallm.io/en/dev-docs/anthropic/overview

Anthropic API - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Anthropic API

Anthropic API

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

Quick Start

Authentication

OpenAI API

OpenAI API

Chat Completions

Streaming

Function Calling

Anthropic API

Anthropic API

Messages

On this page

Available Endpoints

Quick Example

Supported Models

Features

Advanced Reasoning

Large Context Window

Tool Use

Vision Capabilities

SDK Support

Key Differences from OpenAI

Message Format

Response Format

Tool Use Format

Migration Guide

Authentication

Rate Limits

Error Handling

Advanced Features

Conversation History

Temperature and Sampling

Use Cases

Document Analysis

Code Review

Best Practices

Next Steps

Base URL
: 
https://ai.megallm.io
 for all Anthropic-compatible endpoints

​

Available Endpoints

Messages

Create conversational messages with Claude models

Function Calling

Enable Claude to interact with external tools and functions

​

Quick Example

Copy

Ask AI

from

 anthropic 

import

 Anthropic

# Initialize client

client 

=

 Anthropic(

    base_url

=

"https://ai.megallm.io"

,

    api_key

=

"your-api-key"

)

# Create a message

message 

=

 client.messages.create(

    model

=

"claude-3.5-sonnet"

,

    max_tokens

=

100

,

    messages

=

[

        {

            "role"

: 

"user"

,

            "content"

: 

"Explain the theory of relativity in simple terms"

        }

    ]

)

print

(message.content[

0

].text)

​

Supported Models

Model ID

Context Window

Use Case

claude-opus-4-1-20250805

200K tokens

Complex analysis, research

claude-3.5-sonnet

200K tokens

Balanced performance

claude-3.7-sonnet

200K tokens

Fast, efficient responses

claude-sonnet-4

200K tokens

Advanced generation

​

Features

​

Advanced Reasoning

Claude’s sophisticated reasoning capabilities for complex tasks.

​

Large Context Window

Process up to 200K tokens for extensive document analysis.

​

Tool Use

Native support for function calling and tool integration.

​

Vision Capabilities

Analyze images and visual content alongside text.

​

SDK Support

MegaLLM works with Anthropic-compatible SDKs:

Python
: 
anthropic
 official SDK

TypeScript/JavaScript
: 
@anthropic-ai/sdk

Go
: Community SDKs

Ruby
: 
anthropic-rb

​

Key Differences from OpenAI

​

Message Format

Anthropic uses a slightly different message format:

Copy

Ask AI

# Anthropic format

messages 

=

 [

    {

        "role"

: 

"user"

,

        "content"

: 

"Hello, Claude!"

    }

]

# System messages are separate

system 

=

 "You are a helpful assistant"

message 

=

 client.messages.create(

    model

=

"claude-3.5-sonnet"

,

    max_tokens

=

100

,

    system

=

system,  

# System prompt is separate

    messages

=

messages

)

​

Response Format

Copy

Ask AI

# Anthropic response structure

response 

=

 {

    "id"

: 

"msg_123"

,

    "type"

: 

"message"

,

    "role"

: 

"assistant"

,

    "content"

: [

        {

            "type"

: 

"text"

,

            "text"

: 

"Hello! How can I help you today?"

        }

    ],

    "model"

: 

"claude-3.5-sonnet"

,

    "usage"

: {

        "input_tokens"

: 

10

,

        "output_tokens"

: 

25

    }

}

​

Tool Use Format

Copy

Ask AI

tools 

=

 [

    {

        "name"

: 

"get_weather"

,

        "description"

: 

"Get weather for a location"

,

        "input_schema"

: {  

# Note: input_schema, not parameters

            "type"

: 

"object"

,

            "properties"

: {

                "location"

: {

                    "type"

: 

"string"

,

                    "description"

: 

"City name"

                }

            },

            "required"

: [

"location"

]

        }

    }

]

​

Migration Guide

Migrating from Anthropic to MegaLLM:

Copy

Ask AI

# Before (An

...(truncated)

---

## Authentication - MegaLLM

> Source: https://docs.megallm.io/en/dev-docs/getting-started/authentication

Authentication - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Getting Started

Authentication

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

Quick Start

Authentication

OpenAI API

OpenAI API

Chat Completions

Streaming

Function Calling

Anthropic API

Anthropic API

Messages

On this page

Authentication Methods

Bearer Token

API Key Header (Anthropic Format)

Getting Your API Key

Security Best Practices

Environment Variables

Using SDKs

OpenAI SDK

Anthropic SDK

LangChain Integration

Troubleshooting

Common Authentication Errors

Debugging Authentication

​

Authentication Methods

​

Bearer Token

The most common authentication method is using a Bearer token in the Authorization header:

Copy

Ask AI

Authorization

:

 Bearer YOUR_API_KEY

​

API Key Header (Anthropic Format)

For Anthropic-compatible endpoints, you can also use the 
x-api-key
 header:

Copy

Ask AI

x-api-key

:

 YOUR_API_KEY

​

Getting Your API Key

1

Dashboard Method

The recommended method for obtaining an API key is through the MegaLLM dashboard:

Visit 
megallm.io/dashboard

Navigate to API Keys section

Click “Create New API Key”

Copy the key (starts with 
sk-mega-
) and store it securely

2

CLI Tool

If you have the MegaLLM CLI installed:

Copy

Ask AI

npx

 megallm@latest

Follow the interactive prompts to set up your API key.

​

Security Best Practices

Never expose your tokens
: Always store tokens in environment variables or secure vaults, never in code.

​

Environment Variables

 
Linux/Mac

 
Windows

 
Docker

Copy

Ask AI

# Add to ~/.bashrc or ~/.zshrc

export

 MEGALLM_API_KEY

=

"your_api_key_here"

# Or use a .env file

echo

 "MEGALLM_API_KEY=your_api_key_here"

 >>

 .env

Copy

Ask AI

# Set environment variable

[

System.Environment

]::SetEnvironmentVariable(

"MEGALLM_API_KEY"

,

 "your_api_key_here"

,

 "User"

)

# Or use command prompt

setx MEGALLM_API_KEY 

"your_api_key_here"

Copy

Ask AI

# In Dockerfile

ENV

 MEGALLM_API_KEY=${MEGALLM_API_KEY}

# Or in docker-compose.yml

environment:

  - MEGALLM_API_KEY=${MEGALLM_API_KEY}

​

Using SDKs

​

OpenAI SDK

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

​

Anthropic SDK

Copy

Ask AI

from

 anthropic 

import

 Anthropic

client 

=

 Anthropic(

    base_url

=

"https://ai.megallm.io"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

)

)

message 

=

 client.messages.create(

    model

=

"claude-3.5-sonnet"

,

    max_tokens

=

100

,

    messages

=

[{

"role"

: 

"user"

, 

"content"

: 

"Hello!"

}]

)

​

LangChain Integration

Copy

Ask AI

from

 langchain_openai 

import

 ChatOpenAI

llm 

=

 ChatOpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

os.getenv(

"MEGALLM_API_KEY"

),

    model

=

"gpt-4"

)

response 

=

 llm.invoke(

"Hello!"

)

​

Troubleshooting

​

Common Authentication Errors

Error Code

Message

Solution

401

Unauthorized

Check if your API key is valid and not expired

403

Forbidden

Verify API key has required access

429

Rate Limited

Wait and retry or contact support

​

Debugging Authentication

Enable debug mode to see detailed authentication information:

Copy

Ask AI

curl

 https://ai.megallm.io/v1/chat/completions

 \

  -H

 "Authorization: Bearer 

$MEGALLM_API_KEY

"

 \

  -H

 "X-Debug-Auth: true"

 \

  -d

 &#x27;{"model": "gpt-4", "messages": [...]}&#x27;

Need Help?
 Check our 
FAQ
 or contact support if you’re experiencing authentication issues.

Was this page helpful?

Yes

No

Quick Start

OpenAI API

⌘
I

---

## Page Not Found

> Source: https://docs.megallm.io/dev-docs/getting-started/quick-start

Page Not Found

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

Page Not Found

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Overview

MegaLLM Documentation

Models Catalog

FAQ

Getting Started

Getting Started

Quick Start

Setup Guide

First Request

Next Steps

404

Page Not Found

We couldn&#x27;t find the page. Maybe you were looking for one of these pages below?

Quick Start

Usage Examples

CLI Overview

⌘
I

---

## Chat Completions - MegaLLM

> Source: https://docs.megallm.io/en/dev-docs/openai/chat-completions

Chat Completions - MegaLLM

Skip to main content

MegaLLM
 home page

English

Search...

⌘
K

Ask AI

Search...

Navigation

OpenAI API

Chat Completions

Home

Dev docs

CLI/Module

Agents

API reference

Resources

Release Notes

Dashboard

Discord

GitHub

Getting Started

Quick Start

Authentication

OpenAI API

OpenAI API

Chat Completions

Streaming

Function Calling

Anthropic API

Anthropic API

Messages

On this page

Basic Usage

Advanced Features

Message Roles

Temperature Control

Multi-turn Conversations

Vision Support

Response Format

Standard Response

Finish Reasons

Best Practices

Token Optimization

Error Handling

Common Patterns

Summarization

Classification

Code Generation

Rate Limiting

Next Steps

​

Basic Usage

 
Python

 
JavaScript

 
cURL

 
Go

Copy

Ask AI

from

 openai 

import

 OpenAI

client 

=

 OpenAI(

    base_url

=

"https://ai.megallm.io/v1"

,

    api_key

=

"your-api-key"

)

response 

=

 client.chat.completions.create(

    model

=

"gpt-4"

,

    messages

=

[

        {

"role"

: 

"system"

, 

"content"

: 

"You are a helpful assistant."

},

        {

"role"

: 

"user"

, 

"content"

: 

"What&#x27;s the weather like?"

}

    ],

    temperature

=

0.7

,

    max_tokens

=

150

)

print

(response.choices[

0

].message.content)

Copy

Ask AI

import

 OpenAI

 from

 &#x27;openai&#x27;

;

const

 openai

 =

 new

 OpenAI

({

  baseURL:

 &#x27;https://ai.megallm.io/v1&#x27;

,

  apiKey:

 process

.

env

.

MEGALLM_API_KEY

,

});

const

 response

 =

 await

 openai

.

chat

.

completions

.

create

({

  model:

 &#x27;gpt-4&#x27;

,

  messages:

 [

    { 

role:

 &#x27;system&#x27;

, 

content:

 &#x27;You are a helpful assistant.&#x27;

 },

    { 

role:

 &#x27;user&#x27;

, 

content:

 "What&#x27;s the weather like?"

 }

  ],

  temperature:

 0.7

,

  max_tokens:

 150

});

console

.

log

(

response

.

choices

[

0

].

message

.

content

);

Copy

Ask AI

curl

 https://ai.megallm.io/v1/chat/completions

 \

  -H

 "Authorization: Bearer 

$MEGALLM_API_KEY

"

 \

  -H

 "Content-Type: application/json"

 \

  -d

 &#x27;{

    "model": "gpt-4",

    "messages": [

      {"role": "system", "content": "You are a helpful assistant."},

      {"role": "user", "content": "What&#x27;

\&#x27;

&#x27;s the weather like?"}

    ],

    "temperature": 0.7,

    "max_tokens": 150

  }&#x27;

Copy

Ask AI

package

 main

import

 (

    "

context

"

    openai

 "

github.com/sashabaranov/go-openai

"

)

func

 main

() {

    config

 :=

 openai

.

DefaultConfig

(

"your-api-key"

)

    config

.

BaseURL

 =

 "https://ai.megallm.io/v1"

    client

 :=

 openai

.

NewClientWithConfig

(

config

)

    resp

, 

err

 :=

 client

.

CreateChatCompletion

(

        context

.

Background

(),

        openai

.

ChatCompletionRequest

{

            Model

: 

"gpt-4"

,

            Messages

: []

openai

.

ChatCompletionMessage

{

                {

                    Role

:    

"system"

,

                    Content

: 

"You are a helpful assistant."

,

                },

                {

                    Role

:    

"user"

,

                    Content

: 

"What&#x27;s the weather like?"

,

                },

            },

            Temperature

: 

0.7

,

            MaxTokens

:   

150

,

        },

    )

    if

 err

 !=

 nil

 {

        panic

(

err

)

    }

    println

(

resp

.

Choices

[

0

].

Message

.

Content

)

}

​

Advanced Features

​

Message Roles

The API supports different message roles for conversation context:

Role

Description

Example

system

Sets behavior and context

”You are a helpful assistant”

user

User input/questions

”What’s the capital of France?”

assistant

AI responses

”The capital of France is Paris”

tool

Tool/function results

Function execution results

​

Temperature Control

Adjust response creativity with the temperature p

...(truncated)

---

