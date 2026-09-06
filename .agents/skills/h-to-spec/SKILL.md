---
name: h-to-spec
description: Turn a settled conversation into this repository's PRD under docs/prd/ with no interview; publication is acceptance.
---

# To Spec

1. Invoke this skill only when the feature is settled enough to specify. Do not
   interview the User or ask for seam confirmation. If a necessary product or
   architecture decision is missing, publish nothing and return the question to
   `docs/requirements/ledger.md` §2.
2. Use glossary vocabulary and honor only the current R-items and ADRs in scope.
   Link an existing current owner instead of restating its decision.
3. Prepend `type: build|shape` and `honors: <R-items and ADRs>` frontmatter, then
   a `Grounding:` line linking the current ledger items, ADRs, adjacent PRDs, and
   glossary terms. A PRD has no status field: publishing it after a settled grill
   is its acceptance.
4. Publish at `docs/prd/prd-00NN-<slug>.md` using the numbering and heading rule
   in `docs/agents/ARTIFACT-AUTHORING.md`. Do not publish to another tracker or
   apply a triage label.
5. In `Testing Decisions`, link `docs/agents/TESTING.md` and record only the
   feature-specific public seams, participating modules, and test prior art.

Use this PRD body after the frontmatter and `Grounding:` line:

<spec-template>

## Problem Statement

The problem from the User's perspective.

## Solution

The solution from the User's perspective.

## User Stories

An extensive numbered list covering every settled aspect of the feature. Write
each item as:

1. As an <actor>, I want <a capability>, so that <a benefit>.

## Implementation Decisions

The settled modules, interfaces, technical clarifications, architecture, schema,
API contracts, and interactions. Do not include file paths or code snippets that
will go stale. A decision-rich prototype fragment may be included when it is
more precise than prose; trim it to the contract it demonstrates.

## Testing Decisions

The feature-specific public seams, participating modules, and relevant test
prior art.

## Out of Scope

What a reader might reasonably assume is included but is not.

## Further Notes

Any remaining context needed to apply the settled specification.

</spec-template>
