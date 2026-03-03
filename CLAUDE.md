# SterlingX Paid Ads Audit

## Project Overview

Comprehensive paid advertising audit and optimization skill for Claude Code,
customized for SterlingX agency workflows. Forked from
[claude-ads](https://github.com/AgriciDaniel/claude-ads) by AgriciDaniel.

## Architecture

This is a **Claude Code skill** (not a web app). It provides `/ads` slash
commands that run inside Claude Code for auditing paid advertising accounts.

### Key Directories

- `ads/` — Main orchestrator skill (`SKILL.md`) and reference data
- `ads/references/` — 13 RAG reference files (12 base + 1 SterlingX custom)
- `skills/` — 12 specialized sub-skills (one per platform/function)
- `agents/` — 6 parallel audit agents for concurrent analysis
- `scripts/` — Optional Python tools (landing page analysis)
- `research/` — Background research and methodology documentation

### Customizations (SterlingX-specific)

- `ads/references/sterlingx-checks.md` — 15 agency custom checks (SX01-SX15)
- Branded report templates with SterlingX headers and next steps
- Agency naming convention standards
- Client reporting readiness checks
- Agency operations governance checks

## Git Workflow

- `origin` → `https://github.com/akarls-web/claude-ads.git` (your fork)
- `upstream` → `https://github.com/AgriciDaniel/claude-ads.git` (original)

### Pulling upstream updates

```bash
git fetch upstream
git merge upstream/main
# Resolve any conflicts in SterlingX-customized files
```

## Brand Guidelines

This project follows the SterlingX brand:
- **Primary color:** `#543D5E` (brand purple)
- **Font:** Inter (variable)
- Reports use professional, client-ready language
- All generated reports include SterlingX branded headers and footers

## Development Notes

- Skill files use `.md` with YAML frontmatter
- Agent files define `model: sonnet`, `maxTurns: 20`
- Reference files are loaded on-demand (RAG pattern)
- Never load all 13 reference files at startup — only load what the specific
  command needs
- SterlingX custom checks (SX01-SX15) score in a separate 15% weight category
