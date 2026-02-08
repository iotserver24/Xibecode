# Publishing to npm

## Pre-publish Checklist

- [ ] Update version in package.json
- [ ] Update README.md
- [ ] Test locally: `npm run build && npm link`
- [ ] Test installation: `xibecode run "test"`
- [ ] Commit all changes
- [ ] Create git tag

## Steps to Publish

### 1. Login to npm

```bash
npm login
```

### 2. Build

```bash
npm run build
```

### 3. Test

```bash
# Link locally
npm link

# Test
xibecode --version
xibecode run "Create a hello world script"

# Unlink
npm unlink -g xibecode
```

### 4. Publish

```bash
# Dry run first
npm publish --dry-run

# Actual publish
npm publish
```

### 5. Tag release

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Update Package

```bash
# Patch (1.0.0 -> 1.0.1)
npm version patch

# Minor (1.0.0 -> 1.1.0)
npm version minor

# Major (1.0.0 -> 2.0.0)
npm version major

# Publish
npm publish
```

## Package.json Configuration

Already configured:
- ✅ `name`: "xibecode"
- ✅ `bin`: CLI commands (xibecode, xc)
- ✅ `main`: Entry point
- ✅ `files`: What to include in package
- ✅ `prepare` script: Builds before publish
- ✅ Repository, bugs, homepage links

## After Publishing

Users can install with:

```bash
# Global installation
npm install -g xibecode

# Or use with npx (no install)
npx xibecode run "your task"
```

## Scoped Package (Optional)

If you want to publish under a scope (e.g., @yourname/xibecode):

1. Update package.json:
```json
{
  "name": "@yourname/xibecode"
}
```

2. Publish:
```bash
npm publish --access public
```

## Common Issues

### Error: Package name already exists

Solution: Change name in package.json or use scope

### Error: Need to be logged in

Solution: `npm login`

### Error: Cannot publish over existing version

Solution: Update version with `npm version patch/minor/major`

## Unpublish (if needed)

```bash
# Unpublish specific version
npm unpublish xibecode@1.0.0

# Unpublish entire package (within 72 hours)
npm unpublish xibecode --force
```

⚠️ Warning: Unpublishing is permanent and can break projects depending on your package!
