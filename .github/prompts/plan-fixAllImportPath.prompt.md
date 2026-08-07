# Plan: Fix All Import Paths in /src

## TL;DR
The project has path aliases configured in `vite.config.js` (e.g., `@`, `@components`, `@hooks`, `@services`, `@utils`, `@pages`), but NO files are currently using them. All 76+ imports use relative paths (e.g., `../firebase`, `../context/AuthContext`). We need to systematically convert all relative imports to use the configured aliases for better maintainability and consistency.

## Steps

### Phase 1: Preparation
1. Document current import patterns and categorize by type:
   - Firebase imports: `../firebase` → `@/firebase`
   - Context imports: `../context/AuthContext` → `@/context/AuthContext`
   - Components imports: `../components/` → `@components/`
   - Pages imports within pages folder: `./` and `../` → `@pages/` where applicable
   - Local page imports: Keep as is (e.g., `./JobCard` in pages folder)

### Phase 2: Mass Conversion (Grouped by Import Type)
2. Replace all Firebase imports:
   - `../firebase` → `@/firebase` (affects 40+ files)
   - Files: context, pages, components, sections

3. Replace all Context imports:
   - `../context/AuthContext` → `@/context/AuthContext` (affects 6+ files)
   - Files: components, pages

4. Replace all Component imports:
   - `../components/` → `@components/` (affects 5+ files in pages folder)
   - Example: `../components/NotificationModal` → `@components/NotificationModal`

5. Replace all service/helper imports:
   - `./bKashHelper` → `@pages/bKashHelper` (within pages folder)
   - `./paymentFlow` → `@pages/paymentFlow`
   - `./notificationHelper` → `@pages/notificationHelper`
   - `./dealIdHelper` → `@pages/dealIdHelper`

6. Fix nested component imports:
   - FloatingFeedbackButton: `../../firebase` → `@/firebase`

7. Update section imports (if any reference other sections/components)
   - Check sections folder for relative imports

### Phase 3: Validation
8. Run linter and check for any remaining import errors
9. Verify no broken imports remain by checking for TypeScript/ESLint errors

## Files to Modify (Key Categories)
- **Firebase imports**: `context/AuthContext.jsx`, `pages/*.jsx`, `sections/*.jsx`, `components/*.jsx`
- **Context imports**: `components/*.jsx`, `pages/*.jsx`
- **Component imports**: `pages/*.jsx` (importing from components)
- **Service/Helper imports**: `pages/*.jsx` files
- **Root imports**: `main.jsx`, `App.jsx`

## Verification
1. Run `npm run lint` to check for any import-related errors
2. Search for any remaining `from '../` patterns to ensure no missed conversions
3. Verify vite aliases resolve correctly: `from '@/`, `from '@components/`, etc.

## Decisions
- Keep local imports within same folder as-is (e.g., `./JobCard` inside pages folder)
- Use `@/` for root-level src imports (firebase, context)
- Use `@components/`, `@hooks/`, `@services/`, `@utils/`, `@pages/` for category-specific imports
- Do NOT convert external library imports (react, firebase packages, etc.)

## Scope
- ✅ Fix all relative imports to use path aliases
- ✅ Standardize import style across entire src folder
- ❌ NOT modifying CSS imports
- ❌ NOT modifying backend or functions folders
