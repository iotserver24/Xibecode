# XibeCode Feature Guide

## Context Handling - How It Works

### The Problem

Most AI coding tools face these issues:
1. **Token limits** - Can't send entire codebase
2. **Irrelevant context** - Including unnecessary files wastes tokens
3. **Missing context** - Missing imported files causes errors

### XibeCode's Solution

#### 1. Smart Context Discovery

When you ask to modify `userController.js`, XibeCode:

```
1. Reads userController.js
2. Extracts imports:
   - import { User } from './models/User'
   - import { auth } from './middleware/auth'
3. Follows imports and reads:
   - models/User.js
   - middleware/auth.js
4. Finds related files:
   - test/userController.test.js (test file)
   - package.json (config)
5. Builds complete context automatically
```

#### 2. Partial File Reading

For large files (>1000 lines):

```javascript
// Instead of reading entire 5000-line file:
read_file({ path: "big-file.js", start_line: 450, end_line: 550 })

// Gets context around line 500
// Saves tokens while maintaining understanding
```

#### 3. Context Window Management

XibeCode tracks token usage:
- Reserves ~100k tokens for context
- Loads files by priority:
  1. Primary files (explicitly mentioned)
  2. Imported files
  3. Test files
  4. Config files
- Stops at 80% capacity
- Always keeps room for AI responses

### Using Context

```bash
# Let AI discover context automatically
xibecode run "Add input validation to userController.js"

# AI will:
# 1. Read userController.js
# 2. Find it imports: User model, auth middleware
# 3. Read those files
# 4. Understand the full picture
# 5. Add validation that matches existing patterns

# Or explicitly request context
xibecode run "Get context for src/api/users.js and tell me how it works"
```

## File Editing - Advanced Techniques

### 1. Search/Replace (Recommended)

**When to use:** Small, targeted changes

```javascript
// Find unique text and replace it
edit_file({
  path: "app.js",
  search: "const port = 3000;",
  replace: "const port = process.env.PORT || 3000;"
})
```

**Why it's reliable:**
- ✅ Only edits if search text is unique
- ✅ Fails safely if ambiguous
- ✅ Creates automatic backup
- ✅ Shows exact changes in diff

**Best practices:**
```bash
# Good - unique search string
search: "function calculateTotal(items) {\n  return items.reduce"

# Bad - too generic
search: "return"
```

### 2. Line Range Editing

**When to use:** Large files, known line numbers

```javascript
edit_lines({
  path: "large-file.js",
  start_line: 100,
  end_line: 150,
  new_content: "// Entire new implementation"
})
```

**Advantages:**
- ✅ Works on huge files
- ✅ Precise control
- ✅ Efficient (doesn't load whole file)

**When AI uses it:**
```bash
xibecode run "Fix the bug around line 500 in big-file.js"

# AI will:
# 1. read_file big-file.js lines 450-550
# 2. Identify the bug
# 3. edit_lines 495-505 with fix
```

### 3. Insert at Line

**When to use:** Adding new code without replacing

```javascript
insert_at_line({
  path: "app.js",
  line: 5,
  content: "const express = require('express');"
})
```

**Use cases:**
- Adding imports
- Adding new functions
- Inserting middleware

### 4. Automatic Backups

Every edit creates a backup:

```
.xibecode_backups/
  app.js.1707234567890.backup
  app.js.1707234589123.backup
  app.js.1707234601456.backup
```

Revert anytime:

```bash
xibecode run "Revert app.js to previous version"

# Or specific backup:
xibecode run "Revert app.js to backup 1" --verbose
```

## Fixing Bugs - Step by Step

### Example: "Tests are failing"

**User command:**
```bash
xibecode run "The tests in test/user.test.js are failing. Fix them."
```

**What XibeCode does:**

#### Step 1: Understand
```javascript
// Run tests to see failure
run_command({ command: "npm test test/user.test.js" })

// Output:
// FAIL test/user.test.js
//   ✕ should create user (50ms)
//     TypeError: Cannot read property 'save' of undefined
```

#### Step 2: Investigate
```javascript
// Read test file
read_file({ path: "test/user.test.js" })

// Read source code
read_file({ path: "src/controllers/userController.js" })

// Get context (imports, etc.)
get_context({ files: ["src/controllers/userController.js"] })
```

#### Step 3: Identify Issue
```
AI analysis:
- Test expects User.save() method
- Controller doesn't call save()
- Missing database interaction
```

#### Step 4: Fix
```javascript
edit_file({
  path: "src/controllers/userController.js",
  search: "const user = new User(req.body);\n  res.json(user);",
  replace: "const user = new User(req.body);\n  await user.save();\n  res.json(user);"
})
```

#### Step 5: Verify
```javascript
run_command({ command: "npm test test/user.test.js" })

// Output:
// PASS test/user.test.js
//   ✓ should create user (25ms)
```

#### Step 6: Summary
```
💬 Assistant:
Fixed the bug in userController.js. The issue was that we were
creating a User instance but not saving it to the database.
Added await user.save() before sending response.

All tests now pass ✓
```

## Cross-Platform Behavior

### Windows
```bash
xibecode run "List all Python files"

# AI knows it's Windows and uses:
run_command({ command: "dir /s /b *.py" })
```

### macOS/Linux
```bash
xibecode run "List all Python files"

# AI knows it's Unix and uses:
run_command({ command: "find . -name '*.py'" })
```

### File Paths

XibeCode normalizes paths:
- Windows: `src\controllers\user.js`
- Unix: `src/controllers/user.js`

Both work seamlessly!

## Loop Detection

### What It Prevents

```javascript
// Without loop detection:
Iteration 1: read_file("app.js")
Iteration 2: read_file("app.js")  // Same thing again
Iteration 3: read_file("app.js")  // Still doing it
Iteration 4: read_file("app.js")  // Infinite loop!
```

### How It Works

```javascript
// XibeCode tracks recent actions:
History: [
  { tool: "read_file", input: "app.js", time: 1000 },
  { tool: "read_file", input: "app.js", time: 1100 },
  { tool: "read_file", input: "app.js", time: 1200 },
]

// After 3 identical calls:
⚠️  Loop detected: read_file called 3+ times with same parameters
```

### What Happens

```
💬 Assistant receives:
"Error: Loop detected. Try a different approach."

AI adjusts strategy:
Instead of: read_file("app.js") again
Does: edit_file("app.js", ...) to make progress
```

## Real-World Workflows

### Workflow 1: Add Authentication

```bash
xibecode run "Add JWT authentication:
1. Install jsonwebtoken and bcrypt
2. Create auth middleware
3. Add /login and /register endpoints
4. Protect existing routes
5. Add tests"
```

**Execution:**
```
Iteration 1: run_command("npm install jsonwebtoken bcrypt")
Iteration 2: write_file("middleware/auth.js") # Creates middleware
Iteration 3: read_file("app.js") # Understand current routes
Iteration 4: edit_file("app.js") # Add auth routes
Iteration 5: edit_file("app.js") # Protect routes
Iteration 6: write_file("test/auth.test.js") # Add tests
Iteration 7: run_command("npm test") # Verify
```

### Workflow 2: Refactor to TypeScript

```bash
xibecode run "Convert src/ to TypeScript"
```

**Execution:**
```
Iteration 1: search_files("src/**/*.js") # Find all JS files
Iteration 2: read_file("package.json") # Check dependencies
Iteration 3: run_command("npm install -D typescript @types/node")
Iteration 4: write_file("tsconfig.json") # Create config
Iteration 5-15: For each file:
  - read_file("file.js")
  - write_file("file.ts") # Convert with types
Iteration 16: run_command("npx tsc") # Verify compilation
```

### Workflow 3: Debug Production Issue

```bash
xibecode run "Production error: 'Cannot read property x of undefined' 
in userController.js line 42. Fix it." --verbose
```

**Execution:**
```
Iteration 1: read_file("userController.js", 35, 50) # Context
Iteration 2: # AI spots: user.profile.name without null check
Iteration 3: edit_file(
  search: "const name = user.profile.name;",
  replace: "const name = user?.profile?.name || 'Unknown';"
)
Iteration 4: read_file("test/userController.test.js")
Iteration 5: edit_file(...) # Add test for null profile
Iteration 6: run_command("npm test")
```

## Tips & Tricks

### 1. Be Specific About Files

```bash
# Good
xibecode run "Add error handling to src/api/users.js"

# Less good (AI might guess wrong file)
xibecode run "Add error handling to the users file"
```

### 2. Mention Line Numbers for Large Files

```bash
xibecode run "There's a bug around line 500 in data-processor.js"

# AI will read just that section instead of entire 2000-line file
```

### 3. Use Verbose Mode for Complex Tasks

```bash
xibecode run "Refactor entire codebase" --verbose

# Shows every tool call, helpful for debugging
```

### 4. Let AI Discover Context

```bash
# Don't manually list imports
xibecode run "Fix userController.js. It imports User and auth, read those too"

# Just ask
xibecode run "Fix userController.js"

# AI will find imports automatically
```

### 5. Break Down Huge Tasks

```bash
# Instead of:
xibecode run "Build complete e-commerce platform"

# Do:
xibecode run "Create product model and CRUD endpoints"
xibecode run "Add shopping cart functionality"
xibecode run "Implement checkout process"
```

---

**For more examples, see the README.md!**
