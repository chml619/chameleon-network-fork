# SUBSTRATE PALLET DEVELOPMENT WORKFLOW

## ⚠️ CRITICAL RULES - MUST FOLLOW

### 1. NEVER modify Cargo.toml dependencies without explicit approval
- The `Cargo.toml` workspace dependencies are carefully curated to work together
- Changing versions can break the entire build due to Polkadot SDK version conflicts
- The `sc-network-types` issue (kad module not found) is a prime example of what happens when versions drift

### 2. NEVER delete Cargo.lock
- `Cargo.lock` pins all dependencies to known working versions
- It ensures `sc-network-types = 0.15.3` (which has the kad module)
- Deleting it causes cargo to resolve to newer, potentially broken versions

### 3. ALWAYS work on feature branches for new pallets
- Never push pallet changes directly to `develop` without compilation test
- Feature branches allow safe iteration without breaking the baseline

---

## WORKFLOW: Adding a New Pallet

### Step 1: Check/Create Feature Branch
```bash
# Check if feature branch or directory exists
git branch -a | grep feature/
ls -la pallets/

# If directory exists under feature/, clean up and start fresh:
git checkout feature/existing-pallet
git reset --hard origin/develop

# If no feature branch exists, create new one:
git checkout -b feature/new-pallet
```

### Step 2: Add Pallet Code
```bash
# Create pallet directory structure
mkdir -p pallets/new-pallet/src

# Add pallet files:
# - pallets/new-pallet/Cargo.toml
# - pallets/new-pallet/src/lib.rs
# - pallets/new-pallet/src/mock.rs (for tests)
# - pallets/new-pallet/src/tests.rs
```

### Step 3: Modify Cargo.toml (MINIMAL CHANGES ONLY)
```toml
# ONLY add to workspace members:
[workspace]
members = [
    "node",
    "pallets/template",
    "pallets/new-pallet",  # <-- ADD THIS
    "runtime",
]

# ONLY add workspace dependency reference:
[workspace.dependencies]
pallet-new-pallet = { path = "./pallets/new-pallet", default-features = false }  # <-- ADD THIS

# DO NOT CHANGE ANY VERSION NUMBERS
```

### Step 4: Push Feature Branch
```bash
git add .
git commit -m "feat: Add new-pallet skeleton"
git push origin feature/new-pallet
```

---

## TESTING ON CONTABO

### User pulls and tests feature branch:
```bash
cd ~/chameleon-network
git fetch origin
git checkout feature/new-pallet
git pull origin feature/new-pallet

cd node-template
cargo build --release
```

### If compilation succeeds:
```bash
# Merge to develop
git checkout develop
git merge feature/new-pallet
git push origin develop
```

### If compilation fails:
- Fix issues on feature branch
- Push updates
- Re-test until successful
- NEVER merge broken code to develop

---

## BASELINE PROTECTION

### Working Baseline Tag
```bash
git tag baseline-working-v1  # Reference to known working state
```

### If develop becomes broken:
```bash
git checkout develop
git reset --hard baseline-working-v1
git push origin develop --force  # Only with team approval
```

---

## KNOWN ISSUES & SOLUTIONS

### sc-network-types kad module error
**Error:** `could not find 'kad' in 'sc_network_types'`

**Cause:** `sc-network-types >= 0.15.4` removed/changed the kad module

**Solution:** Keep `Cargo.lock` which pins `sc-network-types = 0.15.3`

---

## REFERENCE VERSIONS (DO NOT CHANGE)

```toml
# Working dependency set (from Cargo.lock):
sc-network = "0.49.1"
sc-network-types = "0.15.3"  # MUST be 0.15.3, NOT 0.15.4+
frame-support = "40.1.0"
frame-system = "40.1.0"
sp-runtime = "41.1.0"
```

---

**Last Updated:** December 23, 2025
**Baseline Tag:** `baseline-working-v1`
