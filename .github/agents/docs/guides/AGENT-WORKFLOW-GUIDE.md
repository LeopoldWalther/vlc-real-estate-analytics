# Agent Workflow Quick Reference

> **Quick reference guide** for understanding the file structure and workflow between agents.
> For detailed system documentation, see [docs/README.md](docs/README.md)

│   ├── technical/                  # Implementation guides from @reviewer
│   │   ├── TASK-001-technical-plan.yaml
│   │   ├── TASK-006-technical-plan.yaml
│   │   └── ...
│   └── implementations/            # Optional implementation logs
│       └── IMPLEMENTATION-TASK-XXX.md
│
├── reviews/                        # Critical analysis from @reviewer
│   ├── REVIEW-TASK-001.md         # Analysis, approval, context
│   ├── REVIEW-TASK-006.md         # Why decisions were made
│   └── ...
## File Structure Overview
└── tools/
   └── validate_agent_workflow.py  # Path/status/check consistency validator
│   ├── REVIEW-TASK-001.md         # Analysis, approval, context
│   ├── REVIEW-TASK-006.md         # Why decisions were made
│   └── ...
│
└── plans/technical/                # Implementation guides from @reviewer
    ├── TASK-001-technical-plan.yaml   # Atomic subtasks, Git workflow
    ├── TASK-006-technical-plan.yaml   # Step-by-step implementation
    └── ...
```

## Workflow: From Idea to Implementation

```mermaid
graph TD
    A[User: I want feature X] --> B[@planner Create plan]
    B --> C[dev/plans/TASK-XXX.md]
    C --> D[User: @reviewer Review TASK-XXX]
    D --> E[@reviewer Analyzes plan]
    E --> F{Approved?}
    F -->|No| G[dev/reviews/REVIEW-TASK-XXX.md with REJECTED]
    G --> H[User fixes issues]
    H --> D
    F -->|Yes| I[@reviewer Generates 2 files]
    I --> J[1. dev/reviews/REVIEW-TASK-XXX.md]
    I --> K[2. dev/plans/technical/TASK-XXX-technical-plan.yaml]
    J --> L[User: @coder Implement TASK-XXX]
    K --> L
    L --> M[@coder Reads technical plan]
    M --> N[@coder Skims review for context]
    N --> O[@coder Implements from YAML]
    O --> P[Creates branches, commits per YAML]
    P --> Q[Updates task status in YAML]
    Q --> R[All subtasks done]
    R --> S[Creates PR]
```

## Which File Does What?

| File | Created By | Purpose | Used By | Primary Use |
|------|------------|---------|---------|-------------|
| `dev/plans/TASK-XXX.md` | @planner | Strategic plan with requirements | @reviewer, User | Planning & context |
| `dev/reviews/REVIEW-TASK-XXX.md` | @reviewer | Critical analysis & approval | User, @coder | Understanding decisions |
| `dev/plans/technical/TASK-XXX-technical-plan.yaml` | @reviewer | Atomic implementation steps | @coder | **Implementation guide** |

## TDD Execution Rule (Mandatory)

@coder executes each technical-plan subtask as:
1. **RED**: Add/update a test first and verify it fails for the expected reason.
2. **GREEN**: Implement the minimal code change needed to pass that test.
3. **REFACTOR**: Improve structure/readability while all relevant tests stay green.

## For @coder: Which File to Implement?

### ✅ DO THIS

```bash
@coder Implement TASK-006
```

**@coder will:**
1. Open `dev/plans/technical/TASK-006-technical-plan.yaml` ← **PRIMARY**
2. Read `tasks[]` array with atomic subtasks
3. Follow `branch`, `commit_message`, `acceptance_criteria` from YAML
4. Verify against `allowed_files` and `forbidden_files`
5. Update `status` field as work progresses

**@coder will also:**
1. Skim `dev/reviews/REVIEW-TASK-006.md` for context
2. Understand WHY certain decisions were made
3. Note any critical concerns or alternatives

### ❌ DON'T DO THIS

```bash
# Wrong: Implementing from review document
@coder Implement dev/reviews/REVIEW-TASK-006.md
# Review is analysis, not implementation guide!

# Wrong: Implementing from original plan
@coder Implement dev/plans/TASK-006-xxx.md
# Original plan lacks atomic subtasks and Git workflow
```

## Example: TASK-006 Embedding Visualization

### Step 1: Planning
```
User: "@planner I want to fetch data from API, process it, and visualize"
↓
@planner creates: dev/plans/TASK-006-embedding-visualization-workflow.md
  - Objective
  - Proposed solution (3 scripts)
  - Acceptance criteria
  - Dependencies
  - Effort estimate (8-10 hours)
```

### Step 2: Review
```
User: "@reviewer Review TASK-006"
↓
@reviewer creates:
  1. dev/reviews/REVIEW-TASK-006.md
     - Analysis of architecture
     - Identified 4 critical concerns
     - Re-estimated effort: 10-12 hours
     - Verdict: ✅ APPROVED with refinements

  2. dev/plans/technical/TASK-006-technical-plan.yaml
     - 12 atomic subtasks
     - Task 1: Update requirements.txt (0.25h)
     - Task 2: Implement fetch_data_from_api.py (2.5h)
     - Task 3: Update checkpoint configs (1h)
     - ...
     - Each with: branch name, commit message, acceptance criteria
```

### Step 3: Implementation
```
User: "@coder Implement TASK-006"
↓
@coder:
  1. Opens dev/plans/technical/TASK-006-technical-plan.yaml ← PRIMARY
  2. Reads task 1: "Update requirements.txt"
  3. Sees:
     - branch: "feature/task-006-dependencies"
     - commit_message: "Add visualization dependencies"
     - acceptance_criteria: [4 packages added, no conflicts]
     - allowed_files: ["requirements.txt"]
  4. Implements task 1
  5. Updates status: "not-started" → "in-progress" → "done"
  6. Moves to task 2 (checks depends_on first)
  7. Repeats for all 12 tasks
```

## Key Takeaways

1. **Original Plan** (`dev/plans/TASK-XXX.md`)
   - High-level strategy
   - Requirements and acceptance criteria
   - Created by @planner

2. **Review Document** (`dev/reviews/REVIEW-TASK-XXX.md`)
   - Critical analysis
   - Approval decision
   - Context for WHY
   - Created by @reviewer

3. **Technical Plan** (`dev/plans/technical/TASK-XXX-technical-plan.yaml`)
   - **Atomic subtasks**
   - **Git workflow specs**
   - **THIS IS WHAT @coder IMPLEMENTS**
   - Created by @reviewer

## File Naming Convention

```
Original Plan:     dev/plans/TASK-006-embedding-visualization-workflow.md
Review Document:   dev/reviews/REVIEW-TASK-006.md
Technical Plan:    dev/plans/technical/TASK-006-technical-plan.yaml

Pattern:
  Plans:     TASK-{number}-{descriptive-name}.md
  Reviews:   REVIEW-TASK-{number}.md
  Technical: TASK-{number}-technical-plan.yaml
```

## Questions?

**Q: Why two files from @reviewer?**
A: Separation of concerns. Review explains decisions (context), technical plan enables implementation (action).

**Q: Can @coder implement from review document?**
A: No. Review lacks atomic subtasks and Git workflow. Always use technical plan YAML.

**Q: What if technical plan doesn't exist?**
A: Ask @reviewer to generate it: "@reviewer Generate technical plan for TASK-XXX"

**Q: Can I modify technical plan during implementation?**
A: @coder can ONLY change task `status` field. All other changes require @reviewer approval.

**Q: What if original plan changes after review?**
A: Request new review: "@reviewer Re-review TASK-XXX with updated requirements"
