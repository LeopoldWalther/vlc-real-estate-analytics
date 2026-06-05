# Reviewer Agent Quick Start

**Role:** Quality Gate & Critical Evaluator

The Reviewer Agent critically evaluates task plans before implementation, identifying risks, gaps, and suggesting improvements to ensure high-quality development.

## What Does the Reviewer Do?

The Reviewer acts as your **quality assurance checkpoint** between planning and implementation:

1. **Analyzes Feasibility** - Can this actually be implemented?
2. **Identifies Risks** - What could go wrong?
3. **Checks Completeness** - Are all steps included?
4. **Validates Estimates** - Is the effort realistic?
5. **Suggests Alternatives** - Are there better approaches?
6. **Ensures Standards** - Does it follow project conventions?

## When to Use @reviewer

✅ **DO use @reviewer for:**
- Evaluating plans from @planner before implementation
- Getting a second opinion on approach
- Risk assessment for complex features
- Validating effort estimates
- Ensuring nothing important is missed

❌ **DON'T use @reviewer for:**
- Creating initial plans (use @planner)
- Implementing code (use @coder)
- Simple, obvious tasks with no risk

## How to Invoke

### Basic Usage
```
@reviewer Review TASK-XXX
```

The reviewer will:
1. Read `dev/plans/TASK-XXX.md`
2. Analyze thoroughly from multiple angles
3. Generate **two files**:
   - `dev/reviews/REVIEW-TASK-XXX.md` - Analysis & approval decision
   - `dev/plans/technical/TASK-XXX-technical-plan.yaml` - Implementation guide

### What the Reviewer Checks

**Technical Feasibility:**
- ✓ Is the approach technically sound?
- ✓ Do required dependencies exist?
- ✓ Are there hidden complexity factors?

**Architecture & Design:**
- ✓ Aligns with project architecture?
- ✓ Appropriate design patterns?
- ✓ Will this create technical debt?

**Risk Assessment:**
- ✓ What could go wrong?
- ✓ Performance implications?
- ✓ Backward compatibility issues?

**Completeness:**
- ✓ All necessary steps included?
- ✓ Testing comprehensive?
- ✓ TDD cycle explicit (RED → GREEN → REFACTOR)?
- ✓ Documentation planned?
- ✓ Edge cases considered?

**Standards Compliance:**
- ✓ Follows project conventions?
- ✓ Meets code quality standards?
- ✓ Appropriate error handling?

## Understanding Review Output

### File 1: Review Document (`dev/reviews/REVIEW-TASK-XXX.md`)

**Purpose:** Critical analysis and context

**Contains:**
- ✅ APPROVED or ⚠️ NEEDS REVISION decision
- Strengths of the plan
- Concerns and risks identified
- Alternative approaches considered
- Effort re-estimation
- Recommendations for improvement

**Who reads it:**
- **You** - To understand if plan needs changes
- **@coder** - For context on WHY decisions were made

**Example sections:**
```markdown
## Approval Decision
✅ APPROVED - Ready for implementation with minor notes

## Strengths
- Clear task breakdown
- Good test coverage planned
- Realistic effort estimates

## Concerns
⚠️ MEDIUM: Performance impact on large datasets not addressed
💡 SUGGESTION: Add caching layer

## Alternatives Considered
1. Use existing library X (rejected: too heavyweight)
2. Implement from scratch (selected: better control)
```

### File 2: Technical Plan (`dev/plans/technical/TASK-XXX-technical-plan.yaml`)

**Purpose:** Step-by-step implementation guide for @coder

**This is the CORE DELIVERABLE of the review process.**

**Contains:**
- **Atomic Subtasks**: 15-20 small tasks (each 0.5-2 hours)
- **Acceptance Criteria**: Measurable yes/no checklist per task
- **TDD Criteria**: RED failing test first, GREEN minimal pass, REFACTOR with tests green
- **File Boundaries**: `allowed_files` (can modify) and `forbidden_files` (cannot touch)
- **Branch Strategy**: Unique hierarchical branch per task
- **Dependencies**: Explicit list of what must complete first
- **Commit Messages**: Pre-defined for clean git history
- **Parallelization**: Shows which tasks can run simultaneously

**Who uses it:**
- **@coder** - PRIMARY implementation guide (follow step-by-step)
- **System** - Validates task completion against acceptance criteria
- **Team** - Tracks progress ("5 of 15 tasks complete")

**Why it's critical:**
- Zero ambiguity: Tasks are tiny, specific, measurable
- Prevents scope creep: File boundaries explicit
- Enables parallelization: Dependencies show what can run together
- Clean git history: Commit messages pre-defined
- Trackable progress: Status visible at any time

## The Two-File Output Explained

**The review process creates TWO files:**

| File | Purpose | For | Usage |
|------|---------|-----|-------|
| `REVIEW-TASK-XXX.md` | Analysis & reasoning | Team context | Read for background |
| `TASK-XXX-technical-plan.yaml` | Executable specification | @coder implementation | Follow step-by-step |

**How @coder uses them:**
1. **PRIMARY**: Read technical plan, implement each subtask (1.1, 1.2, 2.1, etc.)
2. **REFERENCE**: Review document explains WHY decisions were made

**You should never have to guess.** The technical plan is complete and executable.

## Review Outcomes

### ✅ APPROVED
Plan is sound and ready for implementation.

**Output:**
- `dev/reviews/REVIEW-TASK-XXX.md` ← Analysis & context
- `dev/plans/technical/TASK-XXX-technical-plan.yaml` ← Implementation guide (READY TO CODE)

**Next step:**
```
@coder Implement TASK-XXX
```

### ⚠️ NEEDS REVISION
Issues must be fixed before a technical plan is created.

**Process:**
1. Read `dev/reviews/REVIEW-TASK-XXX.md` (why revision needed)
2. Update `dev/plans/TASK-XXX.md` (fix the issues)
3. Request review again: `@reviewer Review TASK-XXX`
4. Once approved → technical plan auto-created

**No technical plan is generated until plan is approved.**

### 🔴 REJECTED
Fundamental issues require replanning from scratch.

**Next step:**
```
@planner Revise TASK-XXX addressing [specific concerns]
```

## Review Outcomes

### ✅ APPROVED
Plan is ready for implementation.

**Next step:**
```
@coder Implement TASK-XXX
```

### ⚠️ NEEDS REVISION
Issues found that must be addressed.

**Next steps:**
1. Read the concerns in `dev/reviews/REVIEW-TASK-XXX.md`
2. Address the issues
3. Update the plan in `dev/plans/TASK-XXX.md`
4. Request review again: `@reviewer Review TASK-XXX`

### 🔴 REJECTED
Fundamental issues that require replanning.

**Next step:**
```
@planner Revise TASK-XXX addressing [specific concerns]
```

## Example Workflow

### Step 1: Get a Plan Reviewed

```
User: @planner I want to add user authentication

[Planner creates dev/plans/TASK-001-authentication.md]

User: @reviewer Review TASK-001

Reviewer:
✓ Reading dev/plans/TASK-001-authentication.md
✓ Analyzing technical approach...
✓ Checking for risks...
✓ Validating completeness...

Decision: ✅ APPROVED with recommendations

Generated:
- dev/reviews/REVIEW-TASK-001.md (context & analysis)
- dev/plans/technical/TASK-001-technical-plan.yaml (implementation guide)

Recommendations:
- Add rate limiting to prevent brute force
- Consider OAuth2 in addition to JWT
- Include password reset flow

Ready for implementation!
```

### Step 2: If Revision Needed

```
User: @reviewer Review TASK-002

Reviewer:
⚠️ NEEDS REVISION

Critical issues:
1. Missing error handling for network failures
2. No consideration for concurrent users
3. Database migration strategy unclear

Please update the plan and request review again.
```

```
User: @planner Update TASK-002 to address reviewer concerns

[Planner updates plan]

User: @reviewer Review TASK-002

Reviewer:
✅ APPROVED - Issues addressed
Ready for implementation!
```

## Tips for Better Reviews

### Provide Context in Original Plan

The better the plan from @planner, the better the review:
- Clear objectives and requirements
- Technical constraints mentioned
- Existing code patterns noted
- Expected challenges identified

### Ask Specific Questions

```
@reviewer Review TASK-003, focusing on performance implications
```

```
@reviewer Review TASK-004, I'm concerned about the database approach
```

### Iterate Based on Feedback

If reviewer suggests alternatives, consider them seriously:
- They're based on technical analysis
- May save time and complexity
- Often avoid future problems

## Common Review Patterns

### Performance Reviews
Reviewer checks:
- Algorithm complexity
- Database query efficiency
- Memory usage patterns
- Caching strategies

### Security Reviews
Reviewer checks:
- Input validation
- Authentication/authorization
- Data sanitization
- Secure communication

### Architecture Reviews
Reviewer checks:
- Design pattern appropriateness
- Code organization
- Dependency management
- Maintainability

## Integration with Other Agents

```
@planner Create plan
    ↓
dev/plans/TASK-XXX.md created
    ↓
@reviewer Review TASK-XXX
    ↓
✅ Approved
    ↓
@coder Implement TASK-XXX
```

## Quick Reference

| Action | Command |
|--------|---------|
| Review a plan | `@reviewer Review TASK-XXX` |
| Focus on specific aspect | `@reviewer Review TASK-XXX, focus on [aspect]` |
| After plan updates | `@reviewer Review TASK-XXX` (same command) |

## FAQs

**Q: Do I need to review every task?**
A: For complex or risky tasks, yes. Simple, low-risk tasks can skip review.

**Q: Can I disagree with the reviewer?**
A: Yes! The reviewer provides recommendations, not requirements. You make final decisions.

**Q: What if the reviewer is too strict?**
A: Provide context: `@reviewer Review TASK-XXX, note that [your reasoning]`

**Q: How long does review take?**
A: Usually 1-2 minutes for analysis and file generation.

**Q: Can I implement without review?**
A: Yes, but you'll miss the risk assessment and technical plan generation. @coder expects the technical YAML file from @reviewer.

---

**Ready to review?** Ensure you have a plan from @planner, then invoke `@reviewer Review TASK-XXX` → 🔍
