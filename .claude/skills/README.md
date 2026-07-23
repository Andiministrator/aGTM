# aGTM — Claude Code skills

This folder ships [Claude Code](https://claude.com/claude-code) **skills** for
working with aGTM. A skill is a Markdown file (`SKILL.md`) that Claude Code loads
**on demand** when a task matches its description — so you don't have to paste
docs or remember procedures; Claude picks the right one up automatically, and you
can also invoke it explicitly with `/<name>`.

## Available skills

| Skill | Invoke | What it does |
|---|---|---|
| **cmp-integration** | `/cmp-integration` | Add, fix, or test a CMP `consent_check` adapter (`cmp/cc_<name>.js`) — ES5 rules, comma-strip, both delivery paths, build/test/sync invariants. |
| **config-builder** | `/config-builder` | Build a correct `aGTM.f.config({…})` + init snippet for a site (CMP, GTM containers, consent events, dlSet, session/consent-store, event flags) and check it against the common traps. |
| **integration-check** | `/integration-check` | Diagnose & audit an integration — why GTM isn't loading, consent isn't recognised, or an event never reaches the dataLayer. Works from a pasted config or from runtime state collected on the live page. |
| **live-inspector** | `/live-inspector` | Drive a real browser to run a live end-to-end check — walk the consent flow (accept/deny), prove GTM injects only after consent, verify replay/network, capture a CMP's runtime shape. Needs a connected browser tool (`claude --chrome` or Chrome DevTools MCP). |

## Install

Requires [Claude Code](https://claude.com/claude-code).

- **In this repo:** nothing to do — the skills are committed, so cloning the repo
  makes them available automatically.
- **In another project:** copy the skill folder(s) into
  `<your-repo>/.claude/skills/`.
- **For all your projects:** copy them into `~/.claude/skills/` instead.

## Use

Just describe the task in Claude Code — e.g. "add a CMP adapter for Acme Consent",
"generate an aGTM config for a Cookiebot + GTM setup", or "GTM isn't loading on my
site, help me debug it". Claude loads the matching skill and follows it. Or invoke
one explicitly by name, e.g. `/config-builder`.

Each skill is self-contained but points to the authoritative product docs
(`README.md`, `README-for-Integrators.md`, `CLAUDE.md`) for the full detail.

## License

Apache 2.0, same as the rest of aGTM.
