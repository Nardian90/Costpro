# Code Review Request - Fix TypeScript error in CommandPalette.tsx

## Problem
The build was failing in Vercel/Render due to a TypeScript error in `src/components/landing/CommandPalette.tsx`. Framer Motion's `variants` property was complaining that the `transition.type` value (string literal 'spring') was not assignable to `AnimationGeneratorType`.

## Solution
Applied `as any` to the transition objects in `dialogVariants`. This is a consistent pattern used throughout the codebase to resolve Framer Motion type incompatibilities.

## Verification
- Ran `bun run build` (which includes `next build` and Type-checking). Build successful.
- Grepped the file to confirm the change.
