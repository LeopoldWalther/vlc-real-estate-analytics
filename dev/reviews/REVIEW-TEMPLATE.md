# REVIEW: TASK-XXX - [Task Title]

**Reviewer:** @reviewer
**Review Date:** YYYY-MM-DD
**Plan Version:** [Link to task plan](../TASK-XXX-name.md)
**Status:** [✅ Approved | ⚠️ Changes Recommended | 🔄 Alternative Proposed | ❌ Major Revision Needed]

---

## Executive Summary
[2-3 sentence overview of review outcome and key findings]

---

## Strengths ✅
What's done well in this plan:
- ✅ Strength 1
- ✅ Strength 2
- ✅ Strength 3

---

## Concerns & Recommendations

### 🔴 Critical Issues (Must Address)

#### 1. [Issue Title]
**Severity:** HIGH
**Category:** [Technical Feasibility | Architecture | Risk | Completeness]

**Problem:**
[Detailed description of the issue]

**Impact:**
[What could go wrong if not addressed]

**Recommendation:**
[Specific, actionable solution]

**Evidence:**
[Reference to code, docs, or prior experience]

---

### 🟡 Significant Concerns (Should Address)

#### 1. [Concern Title]
**Severity:** MEDIUM
**Category:** [Performance | Testing | Complexity | Dependencies]

**Problem:**
[Description of concern]

**Recommendation:**
[Suggested improvement]

**Effort to Fix:** [S/M/L]

---

### 🟢 Suggestions (Consider)

#### 1. [Suggestion Title]
**Severity:** LOW
**Category:** [Optimization | Code Quality | Documentation]

**Suggestion:**
[Improvement idea]

**Benefit:**
[Why this would help]

**Optional:** Can proceed without this, but would improve quality/maintainability.

---

## Alternative Approaches

### Alternative 1: [Approach Name]
**Complexity:** [Lower/Similar/Higher]
**Effort:** [S/M/L] (vs. current: [S/M/L])
**Risk:** [Lower/Similar/Higher]

**Description:**
[How this approach differs]

**Pros:**
- ✅ Advantage 1
- ✅ Advantage 2

**Cons:**
- ❌ Disadvantage 1
- ❌ Disadvantage 2

**Recommendation:**
[Consider this if... / Stick with original because...]

---

## Risk Assessment

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| [Risk description] | [Low/Med/High] | [Low/Med/High] | 🔴/🟡/🟢 | [How to mitigate] |
| [Risk description] | [Low/Med/High] | [Low/Med/High] | 🔴/🟡/🟢 | [How to mitigate] |

### Risk Matrix
```
         Impact
         Low   Med   High
       ┌─────┬─────┬─────┐
High   │  🟡  │  🔴  │  🔴  │
Likely ├─────┼─────┼─────┤
Med    │  🟢  │  🟡  │  🔴  │
       ├─────┼─────┼─────┤
Low    │  🟢  │  🟢  │  🟡  │
       └─────┴─────┴─────┘
```

---

## Questions for Planner/User

1. **[Question category]:** [Specific question that needs answering]
   - *Why this matters:* [Context]

2. **[Question category]:** [Another question]
   - *Why this matters:* [Context]

---

## Standards Compliance

### Project Conventions
- [ ] Type hints on all functions
- [ ] Comprehensive docstrings
- [ ] Strategic comments for critical/subtle code
- [ ] Tests included (unit + integration)
- [ ] Follows logging pattern
- [ ] Uses project CLI framework (if applicable)

### Code Quality
- [ ] Functions < 50 lines
- [ ] Single responsibility principle
- [ ] No magic numbers (named constants)
- [ ] Meaningful variable names

### Testing
- [ ] Unit tests for isolated components
- [ ] Integration tests for workflows
- [ ] Edge cases covered
- [ ] >80% coverage target

---

## Effort Estimate Validation

**Original Estimate:** [S/M/L] ([X hours/days])

**Reviewer Assessment:**
- **Adjusted Estimate:** [S/M/L] ([Y hours/days])
- **Confidence:** [Low/Medium/High]

**Rationale:**
[Why estimate is accurate / needs adjustment]

**Hidden Complexity:**
- [Factor 1 that might add time]
- [Factor 2 that might add time]

---

## Codebase Integration

### Reusable Components Found
- `path/to/existing_module.py` - [Can be reused for...]
- `path/to/utility.py` - [Function X already does...]

### Potential Conflicts
- [Component A might conflict with...]
- [Need to coordinate with...]

### Similar Implementations
- [Reference to similar code that worked well]
- [Reference to similar code that had issues]

---

## Performance Considerations

**Assessed Impact:**
- [ ] No performance concern
- [ ] Minor impact (< 5% regression)
- [ ] Moderate impact (5-20% regression)
- [ ] Major concern (> 20% regression or new bottleneck)

**Analysis:**
[Performance implications of the proposed approach]

**Recommendations:**
[Profiling needs, optimization strategies, benchmarks to run]

---

## Documentation & Testing Gaps

### Missing Documentation
- [ ] [Type of doc needed]
- [ ] [Section to add]

### Testing Gaps
- [ ] [Scenario not covered]
- [ ] [Edge case missing]
- [ ] [Integration test needed]

---

## Approval Criteria

To proceed with implementation, the following must be addressed:

### Mandatory (Blockers)
- [ ] [Specific action required]
- [ ] [Specific action required]

### Recommended (Strong suggestions)
- [ ] [Specific action desired]
- [ ] [Specific action desired]

### Optional (Nice to have)
- [ ] [Enhancement suggested]

---

## Recommendation

**Status:** [✅ Approved | ⚠️ Changes Recommended | 🔄 Alternative Proposed | ❌ Major Revision Needed]

### If Approved (✅)
The plan is solid and ready for implementation. Minor suggestions can be incorporated during development or ignored if impractical.

**Action:** Proceed with implementation following the plan.

### If Changes Recommended (⚠️)
The plan has a good foundation but needs specific improvements before implementation.

**Action:** Address concerns marked 🔴 and 🟡, then either re-review or proceed if fixes are straightforward.

### If Alternative Proposed (🔄)
A significantly better approach exists that should be considered.

**Action:** Review alternative approach, discuss trade-offs, decide on direction, update plan accordingly.

### If Major Revision Needed (❌)
The plan has fundamental issues that require substantial replanning.

**Action:** Return to @planner with specific concerns to address. May need to revisit requirements or approach.

---

## Follow-up Actions

1. [ ] [Specific action item]
2. [ ] [Specific action item]
3. [ ] [Update plan document with changes]
4. [ ] [Re-review after changes (if needed)]

---

## Lessons Learned (Post-Implementation)
*[To be filled after task completion]*

**What went well:**
-

**What was missed in review:**
-

**Actual vs estimated effort:**
- Estimated: [X]
- Actual: [Y]
- Variance: [Z%]

**Improvements for future reviews:**
-

---

**Review Complete**
*Next steps: [Summary of immediate actions needed]*
