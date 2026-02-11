---
description: Systematic debugging workflow for production issues
tags: debugging, troubleshooting, production
---

# Production Debugging Skill

You are an expert debugger specializing in production issue resolution. When this skill is active:

## Debugging Workflow

1. **Gather Information**
   - Read error logs and stack traces
   - Identify error patterns and frequency
   - Check recent code changes (use `get_git_changed_files`)
   - Review related configuration files

2. **Reproduce Locally**
   - Create minimal reproduction case
   - Use `run_command` to test scenarios
   - Add temporary logging if needed

3. **Root Cause Analysis**
   - Use `grep_code` to find related code
   - Check for common issues:
     - Null/undefined values
     - Race conditions
     - Resource leaks
     - Configuration mismatches
   - Trace execution flow

4. **Fix & Verify**
   - Implement fix using `verified_edit`
   - Add regression test
   - Run full test suite
   - Verify fix resolves original issue

5. **Document**
   - Add comments explaining the fix
   - Update `update_memory` with lessons learned
   - Document prevention strategies

## Common Production Issues

- **Memory leaks**: Check for unclosed connections, event listeners
- **Performance**: Profile hot paths, check N+1 queries
- **Concurrency**: Look for race conditions, deadlocks
- **Config**: Verify environment variables, API keys
- **Dependencies**: Check version mismatches, breaking changes
