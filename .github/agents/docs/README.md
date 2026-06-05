# Three-Agent TDD Development System

## System Overview

```
╭────────────────────────────────────────────────────────────────────╮
│         Three-Agent Development Pipeline                        │
╰────────────────────────────────────────────────────────────────────╯

┌──────────────────────────────────────────────────────────────────┐
│                          YOUR IDEA                               │
│                                                                  │
│  "I want to add user authentication to my application"          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    @planner Agent (Planning)                      │
│                                                                  │
│  ✓ Analyzes codebase & architecture                             │
│  ✓ Discusses requirements & approach                            │
│  ✓ Breaks down into actionable tasks                            │
│  ✓ Creates detailed task plans                                  │
│                                                                  │
│  Output: TASK-001.md, TASK-002.md, TASK-003.md                 │
│  Status: 🔵 Planned                                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                  @reviewer Agent (Validation)                     │
│                                                                  │
│  ✓ Critically evaluates feasibility                             │
│  ✓ Identifies risks & gaps                                      │
│  ✓ Suggests alternatives & improvements                         │
│  ✓ Validates effort estimates                                   │
│  ✓ Checks standards compliance                                  │
│                                                                  │
│  Output: REVIEW-001.md (✅ Approved)                           │
│  Status: Ready for implementation                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                   @coder Agent (Implementation)                    │
│                                                                  │
│  Phase 1: Create Authentication Module                           │
│  ├─ Implement step by step                                      │
│  ├─ Write unit tests (87% coverage)                             │
│  └─ Commit: abc1234 "feat: Create auth module (Phase 1)"       │
│                                                                  │
│  Phase 2: Integrate with API                                     │
│  ├─ Modify existing code                                        │
│  ├─ Write integration tests (91% coverage)                      │
│  └─ Commit: def5678 "feat: Integrate CAN (Phase 2)"           │
│                                                                  │
│  Phase 3: Add Documentation                                     │
│  ├─ Create docs and examples                                    │
│  ├─ All tests passing (92% coverage)                            │
│  └─ Commit: ghi9012 "docs: Add docs (Phase 3)"                 │
│                                                                  │
│  Output: feature/can-signal-parser branch (ready for PR)        │
│  Status: 🟢 Complete                                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                   Code Review & Merge (Manual)                    │
│                                                                  │
│  ✓ Create PR on GitHub                                          │
│  ✓ Team code review                                             │
│  ✓ Address feedback                                             │
│  ✓ Merge to main branch                                         │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                      ✓ Feature Complete!
```

## Repository Defaults (VLC Update)

This repository uses a strict TDD-first variant of the three-agent system.

- Canonical planning paths:
  - `dev/plans/` for top-level plans
  - `dev/reviews/` for review outputs
  - `dev/plans/technical/` for technical implementation plans
  - `dev/plans/implementations/` for optional implementation logs
- Mandatory execution model for `@coder`: RED → GREEN → REFACTOR per subtask.
- Status source of truth: `dev/plans/technical/TASK-XXX-technical-plan.yaml`.
- Canonical `required_checks` values in technical plans:
  - `python-lint-and-test`
  - `terraform-validate`
  - `workflow-consistency`
- Hard CI gates:
  - `.github/workflows/python-test.yml` enforces ruff, black, mypy, and pytest with `--cov-fail-under=80`.
  - `.github/workflows/terraform-validate.yml` validates terraform in dev/prod.
  - `.github/workflows/workflow-consistency.yml` enforces planning/review/path consistency.
- Local pre-PR validator: run `python dev/tools/validate_agent_workflow.py`.

## Agent Roles & Responsibilities

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLANNER AGENT 📋                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:     User's high-level goal or feature idea             │
│  PROCESS:   1. Analyze codebase                                │
│             2. Discuss approach (ask clarifying questions)     │
│             3. Identify dependencies                           │
│             4. Break into tasks (dependencies, effort)         │
│             5. Create detailed task documents                  │
│  OUTPUT:    TASK-XXX.md files (🔵 Planned status)             │
│  FILES:     dev/plans/TASK-*.md                                 │
│                                                                 │
│  WHO USES:  Designer/Architect role                            │
│  WHEN:      Starting new work, complex features, planning      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     REVIEWER AGENT 🔍                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:     Task plan from Planner                             │
│  PROCESS:   1. Parse plan thoroughly                           │
│             2. Verify feasibility & completeness               │
│             3. Identify risks & gaps                           │
│             4. Suggest alternatives                            │
│             5. Check project conventions                       │
│             6. Create Technical Plan (YAML)                    │
│  OUTPUT:    REVIEW-TASK-XXX.md (approval decision)             │
│             TASK-XXX-technical-plan.yaml (executable plan)     │
│  FILES:     dev/reviews/REVIEW-*.md                            │
│             dev/plans/technical/TASK-*-technical-plan.yaml     │
│                                                                 │
│  WHO USES:  Tech Lead/QA role                                  │
│  WHEN:      After planning, before implementation              │
│                                                                 │
│  🌟 CREATES: Technical Plan (atomic subtasks, dependencies)    │
│     This is the bridge between human planning & execution      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
│  PROCESS:   1. Parse plan thoroughly                           │
│             2. Verify feasibility & completeness               │
│             3. Identify risks & gaps                           │
│             4. Suggest alternatives                            │
│             5. Check project conventions                          │
│             6. Validate effort estimates                       │
│  OUTPUT:    REVIEW-TASK-XXX.md (approval or suggestions)      │
│  FILES:     dev/reviews/REVIEW-*.md                      │
│                                                                 │
│  WHO USES:  Tech Lead/QA role                                  │
│  WHEN:      After planning, before implementation              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     CODER AGENT 💻                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:     Approved task plan from Planner+Reviewer           │
│  PROCESS:   1. Create feature branch                           │
│             2. For each phase:                                 │
│                a. Implement step-by-step                       │
│                b. Write type hints & docstrings                │
│                c. Write unit tests                             │
│                d. Run tests & verify coverage                  │
│                e. Make atomic commits                          │
│             3. Push branch when complete                       │
│  OUTPUT:    feature/task-name branch (🟢 Complete)            │
│  FILES:     Code changes + tests                               │
│             dev/plans/implementations/IMPLEMENTATION-*.md       │
│                                                                 │
│  WHO USES:  Developer role                                     │
│  WHEN:      After approval, implementation time                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Process Flow

```
IDEA
  ↓
  ├─→ @planner Discussion
  │     • Ask clarifying questions
  │     • Discuss technical approach
  │     • Propose multiple options
  │     • Gather requirements
  │   ↓
  └─→ PLAN CREATED (TASK-XXX.md)
      Status: 🔵 Planned
      ↓
      ├─→ @reviewer Analysis
      │     • Check feasibility
      │     • Identify risks
      │     • Suggest improvements
      │     • Validate estimates
      │   ↓
      └─→ REVIEW CREATED (REVIEW-TASK-XXX.md)
          ↓
          Does plan need changes?
          ├─→ YES (⚠️)
          │     ↓
          │     Update Plan
          │     (Back to @reviewer if major)
          │     ↓
          ├─→ NO (✅)
              ↓
              ├─→ @coder Implementation
              │     • Create branch
              │     • Implement Phase 1
              │     • Write tests
              │     • Commit
              │     • Implement Phase 2...
              │     • Implement Phase 3...
              │   ↓
              └─→ BRANCH READY (feature/task-name)
                  Status: 🟢 Complete
                  ↓
                  Create PR on GitHub
                  ↓
                  Team Code Review
                  ↓
                  Merge to Main
                  ↓
                  ✓ FEATURE LIVE
```

## 📋 Understanding Technical Plans (Critical Section)

**The Technical Plan is the core bridge between planning and implementation.**

### What Gets Created at Review Stage?

When @reviewer analyzes a plan, it creates **TWO files**:

1. **`dev/reviews/REVIEW-TASK-001.md`** ← Analysis & context
   - Why decisions were made
   - What concerns were raised
   - Alternative approaches considered

2. **`dev/plans/technical/TASK-001-technical-plan.yaml`** ← Implementation specification
   - 15-20 atomic subtasks
   - Dependencies & parallelization info
   - Acceptance criteria per task
   - Allowed/forbidden files
   - Branch names & commit messages
   - Ready for @coder to implement

### Key Features of Technical Plans

✅ **Atomic Subtasks**: Each 0.5-2 hours (completable in one session)
✅ **Acceptance Criteria**: Measurable, testable success conditions
✅ **File Safety**: `allowed_files`/`forbidden_files` prevents scope creep
✅ **Branch Strategy**: Unique per task: `feature/{parent}/{phase}.{number}-{slug}`
✅ **Dependencies**: Explicit graph shows parallelization opportunities
✅ **Git Workflow**: Pre-defined commit messages for clean history

### Benefits

| For Developers | For Teams | For Quality |
|---|---|---|
| Zero ambiguity | Consistent process | Complete work |
| Step-by-step guidance | Easy handoff | Nothing missed |
| Safe parallel work | Clear progress | Tested at each step |
| Know when done | Predictable timeline | No scope creep |

### What @coder Does with Technical Plans

When you receive: `@coder Implement TASK-001`

You will:
1. **Read**: `dev/plans/technical/TASK-001-technical-plan.yaml` ← This is your specification
2. **Reference**: `dev/reviews/REVIEW-TASK-001.md` ← Context about decisions

The technical plan is **complete**, **testable**, and **ready to implement** step-by-step. Don't add, remove, or modify tasks—follow it exactly.

---

## File Organization

```
ProjectRoot/
│
├── .github/agents/                    ← Agent system root
│   ├── agents/                        ← Agent specifications
│   │   ├── planner.agent.md           ✓ Planner agent
│   │   ├── reviewer.agent.md          ✓ Reviewer agent
│   │   └── coder.agent.md             ✓ Coder agent
│   │
│   └── docs/                          ← Documentation & guides
│       ├── README.md                  ✓ This file (system overview)
│       └── guides/
│           ├── AGENT-WORKFLOW-GUIDE.md✓ Workflow reference
│           ├── PLANNER_GUIDE.md       ✓ How to use planner
│           ├── REVIEWER_GUIDE.md      ✓ How to use reviewer
│           └── CODER_GUIDE.md         ✓ How to use coder
│
├── dev/plans/                         ← Development planning
│   ├── README.md                      ✓ Task tracker & overview
│   ├── TASK-TEMPLATE.md               ✓ Task template
│   ├── TASK-001-name.md              📝 Individual task plan
│   ├── TASK-002-name.md              📝 Individual task plan
│   ├── technical/                     ✓ Technical plans from reviewer
│   │   └── TASK-001-technical-plan.yaml
│   └── implementations/               ✓ Optional implementation tracking
│       ├── .gitkeep
│       └── IMPLEMENTATION-TASK-001.md
│
├── dev/reviews/                       ✓ Review documents
│   ├── REVIEW-TEMPLATE.md             ✓ Review template
│   ├── REVIEW-TASK-001.md            📝 Review of task 1
│   └── REVIEW-TASK-002.md            📝 Review of task 2
│
├── src/                               ← Your Project Code
│   └── ...
│
└── tests/                             ← Your Tests
    ├── unit/
    └── integration/
```

## Status Indicators

```
Task Status Throughout Pipeline:

PLANNING PHASE:
  🔵 Planned           ← Initial status, plan created

REVIEW PHASE:
  ⚠️ Under Review      ← Reviewer analyzing
  📝 Changes Needed    ← Reviewer has feedback
  ✅ Approved          ← Ready to implement

IMPLEMENTATION PHASE:
  🟡 In Progress       ← Coder working on it
  🔴 Blocked           ← Waiting for dependency

COMPLETION PHASE:
  🟢 Complete          ← Code merged to main
  ✓ Verified           ← Working in production
```

## Typical Timelines

```
SMALL TASK (S)
  Planning:         15 min
  Review:           10 min
  Implementation:   30-60 min
  Code Review:      15 min
  ────────────────────────
  TOTAL:            1.5 hours

MEDIUM TASK (M)
  Planning:         30 min
  Review:           15 min
  Implementation:   1.5-2 hours
  Code Review:      30 min
  ────────────────────────
  TOTAL:            2.5-3 hours

LARGE TASK (L)
  Planning:         1 hour
  Review:           30 min
  Implementation:   4-8 hours
  Code Review:      1-2 hours
  ────────────────────────
  TOTAL:            6-12 hours (often spread over 2-3 days)
```

## Success Metrics

```
✅ Planning Success:
   • Clear, actionable steps
   • Dependencies identified
   • Realistic estimates
   • Measurable success criteria

✅ Review Success:
   • Risks identified
   • Feasibility validated
   • Alternatives considered
   • Standards compliance verified

✅ Implementation Success:
   • All tests passing
   • >80% coverage
   • Follows conventions
   • Meaningful commits
   • Branch ready for PR

✅ Overall Success:
   • Code merged to main
   • Feature working as planned
   • Team satisfied with quality
   • Technical debt not increased
```

## Getting Started

### Quick Start: 3 Steps

**1. Read the Workflow**
```
.github/agents/docs/README.md
.github/agents/docs/guides/AGENT-WORKFLOW-GUIDE.md
```
Understand the complete process and how the three agents work together.

**2. For Planning**: Use the Planner Agent
```
@planner I want to [describe your goal]
```
Read: [PLANNER_GUIDE.md](guides/PLANNER_GUIDE.md)

**3. For Implementation**: Use the Coder Agent
```
@coder Implement TASK-XXX
```
Read: [CODER_GUIDE.md](guides/CODER_GUIDE.md)

## Key Documents

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [AGENT-WORKFLOW-GUIDE.md](guides/AGENT-WORKFLOW-GUIDE.md) | Quick reference for file structure | 5 min |
| [guides/PLANNER_GUIDE.md](guides/PLANNER_GUIDE.md) | How to plan work effectively | 5 min || [guides/REVIEWER_GUIDE.md](guides/REVIEWER_GUIDE.md) | How to review plans critically | 5 min || [guides/CODER_GUIDE.md](guides/CODER_GUIDE.md) | How to implement approved plans | 5 min |


## Real-World Examples

### Example 1: New Feature
**Goal:** Add authentication support
**Time:** ~3 hours

```
15 min:  @planner I want to add user authentication
         ↓ Discussion about format, integration, requirements
10 min:  @reviewer Review TASK-001
         ↓ Approved with minor suggestions
1.5 hr:  @coder Implement TASK-001
         ↓ Code written, tested, branch pushed
30 min:  Create PR, team review, merge
────────────────
TOTAL: ~3 hours
```

### Example 2: Performance Optimization
**Goal:** Reduce training time by 20%
**Time:** ~8 hours

```
1 hour:  @planner Data pipeline optimization for better performance
         ↓ Deep discussion about bottlenecks and solutions
30 min:  @reviewer Review all optimization tasks
         ↓ Risk analysis, feasibility check
30 min:  Plan refinement based on feedback
4 hours: @coder Implement multiple phases with tests
         ↓ Batch loading improvements, prefetch tuning, etc.
2 hours: Code review, testing, integration
────────────────
TOTAL: ~8 hours
```

### Example 3: Bug Investigation
**Goal:** Fix NaN loss in training
**Time:** ~2.5 hours

```
30 min:  @planner Model training crashes with NaN loss
         ↓ Discuss symptoms, conditions, investigation approach
10 min:  @reviewer Quick validation of investigation plan
         ↓ Approved, suggests specific areas to check
1 hour:  @coder Add diagnostics, identify root cause, apply fix
30 min:  Team verification and merge
────────────────
TOTAL: ~2.5 hours
```

## Common Questions

**Q: Do I need to use all three agents?**
A: For best results, yes. But minimum workflow is: Planner → Coder. Review is strongly recommended.

**Q: Can I skip planning and go straight to implementation?**
A: Possible but not recommended. Planning saves time and improves quality.

**Q: What if a task is blocked?**
A: Mark as 🔴 Blocked in the plan, document the blocker, move to other tasks.

**Q: How long does the full cycle take?**
A: Varies: Small tasks ~1.5 hrs, Medium ~2.5-3 hrs, Large ~6-12 hrs.

**Q: Can I parallelize tasks?**
A: Yes! Implement independent tasks in parallel, sequence dependent ones.

**Q: What happens after implementation?**
A: Create PR on GitHub, team reviews and merges to main branch.

## Integration with Your Project

This system works seamlessly with your project:
- ✅ Follows all clean code standards (type hints, docstrings)
- ✅ Uses your testing framework (>80% coverage target)
- ✅ Respects project architecture and patterns
- ✅ Follows git workflow (feature branches, atomic commits)
- ✅ Uses your configuration system
- ✅ Works with existing CI/CD (if configured)

## Next Steps

1. **Read the quick reference:** [AGENT-WORKFLOW-GUIDE.md](guides/AGENT-WORKFLOW-GUIDE.md) (5 min)
2. **Start planning:** `@planner I want to...`
3. **Get review:** `@reviewer Review TASK-XXX`
4. **Implement:** `@coder Implement TASK-XXX`
5. **Create PR:** Create on GitHub, merge after review
6. **Iterate:** Use system for all future development

---

## Contact & Support

- **Planning help?** → [guides/PLANNER_GUIDE.md](guides/PLANNER_GUIDE.md)- **Review help?** → [guides/REVIEWER_GUIDE.md](guides/REVIEWER_GUIDE.md)- **Implementation help?** → [guides/CODER_GUIDE.md](guides/CODER_GUIDE.md)
- **Full workflow?** → [AGENT-WORKFLOW-GUIDE.md](guides/AGENT-WORKFLOW-GUIDE.md)

---

**Ready to get started?** Begin with `@planner [your idea]` → 🚀
