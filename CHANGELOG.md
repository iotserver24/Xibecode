# Changelog

All notable changes to XibeCode will be documented in this file.

## [0.2.0] - 2026-02-11

### 🎉 Major Features

#### AI-Powered Skill Synthesis

The `/learn` command now uses Claude AI to generate high-quality, structured skill files from documentation instead of raw text dumps.

**Before**: Raw HTML-stripped text with navigation elements and broken formatting  
**After**: Clean, comprehensive skills with:

- Overview & key concepts
- Properly formatted code examples  
- Best practices & gotchas
- Quick reference cheat-sheet

**Technical Details**:

- Uses Claude AI with 32,768 max tokens for synthesis
- Condensed doc summaries (up to 60K chars) for context
- Graceful fallback to basic formatting if AI unavailable
- Automatically uploads synthesized skills to marketplace

### 🔧 Improvements

- **Skills Marketplace Integration** (from v0.1.9):
  - `/marketplace` - Browse and install community skills
  - Auto-upload skills after `/learn`
  - Search by keywords and categories
  
### 🐛 Bug Fixes

- Fixed marketplace upload failures for large content (increased limit to 500KB)
- Fixed token limit issues in skill processing (now 32K tokens)
- Improved error handling for skill synthesis

### 📦 Dependencies

- Added `@anthropic-ai/sdk` for AI-powered skill generation

## [0.1.9] - 2026-02-11

### Features

- Skills Marketplace integration
- `/marketplace` command for browsing and installing skills
- Auto-upload to marketplace after `/learn`

## [0.1.8] - 2026-02-11

### Features

- `/learn` command for scraping documentation and creating skills
- Basic skill management improvements
