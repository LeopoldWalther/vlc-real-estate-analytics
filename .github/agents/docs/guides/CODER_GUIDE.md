# Coder Agent Quick Start

## What is the Coder Agent?

The Coder Agent implements task plans step-by-step, writing production-ready code with full test coverage, following all project conventions, and maintaining clean git history.

## Quick Facts

✅ **Creates feature branches** - One per task
✅ **Implements step-by-step** - Following the technical plan exactly
✅ **Writes failing tests first** - RED before GREEN
✅ **Makes meaningful commits** - Clear history per phase
✅ **Follows conventions** - Type hints, docstrings, comments
✅ **Tracks progress** - Real-time updates during implementation
✅ **Ready for PR** - Branch pushed and documented

## Prerequisites

Before invoking the Coder Agent, ensure:
1. ✅ Task plan exists in `dev/plans/TASK-XXX.md`
2. ✅ Plan has been reviewed by @reviewer
3. ✅ Technical plan exists in `dev/plans/technical/TASK-XXX-technical-plan.yaml`
4. ✅ Plan has approval status: ✅ or ⚠️ (with fixes applied)
5. ✅ All success criteria are defined
6. ✅ Testing requirements are specified
7. ✅ Files to modify are listed

## How to Invoke

### Basic Implementation
```
@coder Implement TASK-001-add-can-signal-parser
```

### From Specific Path
```
@coder Implement dev/plans/technical/TASK-001-technical-plan.yaml
```

### With Task ID
```
@coder Implement TASK-001
```

### Resume Work (if interrupted)
```
@coder Resume TASK-001 from Phase 2
```

### Batch Implementation
```
@coder Implement all approved tasks in current sprint
```

### Interactive Mode (pause between phases)
```
@coder Implement TASK-001 in interactive mode
```

### Draft Mode (don't push yet)
```
@coder Implement TASK-001 as draft branch
```

## What Happens

### Before Implementation
1. Reads and parses technical plan
2. Verifies plan is approved
3. Checks for blocking dependencies
4. Analyzes existing codebase for integration points
5. Asks clarifying questions if needed

### During Implementation (Per Phase)
1. **Create feature branch** if not exists
2. **RED:** add/update test first and confirm expected failure
3. **GREEN:** implement minimal code to pass that test
4. **REFACTOR:** improve code while keeping tests green
5. **Add type hints** to all functions
6. **Write docstrings** (Google/NumPy style)
7. **Add strategic comments** for complex code
8. **Run tests** after each step
9. **Verify coverage** >80% target
10. **Make atomic commits** per completed step

### After Each Phase
- ✓ All tests pass
- ✓ Coverage verified
- ✓ Progress logged
- ✓ Ready for next phase

### After Implementation Complete
- ✓ All phases finished
- ✓ All tests passing
- ✓ Branch pushed to remote
- ✓ Implementation summary created
- ✓ Task status updated to 🟢
- ✓ Ready for PR and code review

## Example Workflow

### Step 1: Create Plan
```
@planner I want to add REST API endpoints for data export
```
*Agent creates TASK-001-add-can-signal-parser.md*

### Step 2: Review Plan
```
@reviewer Review TASK-001
```
*Agent provides feedback, approves with status ✅*

### Step 3: Implement Plan
```
@coder Implement TASK-001
```

**Output:**
```
✓ Verified plan is approved
✓ Feature branch created: feature/can-signal-parser
✓ Implementing Phase 1: Create CAN Parser Module

  Phase 1 (8/8 steps)
  ├─ Created model/can_parser.py with parsing logic
  ├─ Added comprehensive type hints and docstrings
  ├─ Implemented error handling
  ├─ Created tests/unit/test_can_parser.py
  ├─ 12 tests passing, 87% coverage ✓
  └─ Commit: abc1234 "feat: Create CAN parser (TASK-001-Phase-1)"

✓ Implementing Phase 2: Integrate with API

  Phase 2 (12/12 steps)
  ├─ Modified data/generate_dataset.py
  ├─ Created CAN integration layer
  ├─ Added integration tests
  ├─ 15 tests passing, 91% coverage ✓
  └─ Commit: def5678 "feat: Integrate CAN (TASK-001-Phase-2)"

✓ Implementing Phase 3: Documentation

  Phase 3 (6/6 steps)
  ├─ Created docs/can_signals.md
  ├─ Added example: examples/can_example.py
  ├─ Updated README.md
  ├─ All tests passing, 92% coverage ✓
  └─ Commit: ghi9012 "docs: Add CAN documentation (TASK-001-Phase-3)"

✓ TASK-001 Implementation Complete!
  • Branch: feature/can-signal-parser
  • Total commits: 7
  • Final coverage: 92% (target: >80%) ✓
  • All success criteria verified ✓
  • Ready for PR ✓

Next: Create PR on GitHub for team review
```

### Step 4: Code Review & Merge
- Create PR referencing TASK-001
- Team reviews code
- Merge to main branch

## Progress Tracking

The Coder Agent creates an implementation log in:
```
dev/plans/implementations/IMPLEMENTATION-TASK-XXX.md
```

This log tracks:
- Current phase and progress
- Files created/modified
- Tests and coverage
- Git commits made
- Issues and decisions
- Success criteria verification

## Code Quality Standards

The Coder Agent ensures:

### Type Annotations
```python
# ✅ ALWAYS include types
def process(data: dict, options: Optional[dict] = None) -> dict:
    """Process tensor."""
```

### Docstrings
```python
def forward(self, x: torch.Tensor) -> torch.Tensor:
    """
    Brief description.

    Args:
        x: Input tensor [batch_size, channels, time_steps]

    Returns:
        Output tensor [batch_size, embed_dim]
    """
```

### Strategic Comments
```python
# CRITICAL: Explain WHY this is needed
# Shape: [B, C, T] → [B, C, E]
result = transform(x)
```

### Testing
- ✅ Unit tests for components
- ✅ Integration tests for workflows
- ✅ Edge cases covered
- ✅ >80% coverage target

## Git Workflow

### Branching
```bash
# Main feature branch
git checkout -b feature/task-name

# From task ID
git checkout -b feature/can-signal-parser
```

### Commits Per Phase
```
Phase 1 (TDD):
  ✓ "test: Add failing parser test (TASK-001-1 RED)"
  ✓ "feat: Implement minimal parser behavior (TASK-001-1 GREEN)"
  ✓ "refactor: Clean parser implementation (TASK-001-1 REFACTOR)"

Phase 2 (TDD):
  ✓ "test: Add failing integration test (TASK-001-2 RED)"
  ✓ "feat: Implement minimal integration code (TASK-001-2 GREEN)"

Phase 3:
  ✓ "docs: Document CAN signals (TASK-001-Phase-3)"
```

## Testing

### Coverage Requirements
- **Target:** >80% for new code
- **Minimum:** >70% acceptable with justification
- **Ideal:** >90% for core logic

### Test Types
1. **Unit Tests** - Isolated functions/classes
2. **Integration Tests** - Component interactions
3. **Edge Cases** - Boundary conditions

## Handling Issues

If something goes wrong during implementation:

### Critical Issues (Stop & Ask)
- Merge conflicts
- Test failures I can't fix
- Unclear specifications
- Dependency problems

### Fixable Issues (Fix & Continue)
- Import errors
- Linting issues
- Minor test failures
- Style adjustments

### Normal Issues (Continue)
- Deprecation warnings
- Slow tests
- Documentation refinements

## After Implementation

Once complete, the Coder Agent will:

1. ✓ Update task status to 🟢 Complete
2. ✓ Push branch to remote
3. ✓ Create implementation summary
4. ✓ Prepare PR template
5. ✓ Provide merge instructions

Then you should:
1. Create PR on GitHub
2. Request team code review
3. Address review comments
4. Merge to main branch

## Integration with Your Project

The Coder Agent is aware of:
- Project architecture patterns
- Data handling (PyArrow, parquet, modalities)
- Config system (YAML, load_config, etc.)
- CI/CD integration
- Testing patterns (pytest, fixtures)
- Logging conventions (Python logging)
