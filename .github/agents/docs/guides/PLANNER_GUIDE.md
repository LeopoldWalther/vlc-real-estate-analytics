# Planner Agent Quick Start Guide

## What is the Planner Agent?

The Planner Agent is your strategic development partner. It helps transform ideas into structured, actionable development tasks with proper version control practices.

## When to Use

✅ **Use the Planner Agent when:**
- Starting work on a new feature
- Breaking down complex requirements
- Migrating architecture
- Need to discuss technical approaches
- Planning a sprint or milestone
- Uncertain about implementation strategy

❌ **Don't use for:**
- Writing actual code (use main Copilot)
- Simple bug fixes
- Debugging existing code

## How to Invoke

### Method 1: Direct Request
```
@planner I want to add caching layer for improved performance
```

### Method 2: Discussion Mode
```
@planner Let's discuss implementing a transformer-based attention mechanism for multi-modal fusion
```

### Method 3: Planning Session
```
@planner Help me plan the next development sprint. We need to improve inference speed and add model interpretability.
```

## What Happens Next

1. **Analysis Phase** - Agent examines relevant code and documentation
2. **Discussion Phase** - Agent asks clarifying questions about:
   - Requirements and constraints
   - Technical preferences
   - Priority and timeline
   - Dependencies and integration points

3. **Planning Phase** - Agent proposes:
   - Task breakdown with dependencies
   - TDD slices per task (RED → GREEN → REFACTOR)
   - Branch naming strategy
   - Implementation approach
   - Effort estimates

4. **Documentation Phase** - Agent creates:
   - Task plan documents in `dev/plans/TASK-XXX-name.md`
   - Updates `dev/plans/README.md` with new tasks
   - Branch names and workflow guidance

## Example Workflow

### Step 1: Invoke Planner
```
@planner I need to add support for webhook notifications as a new feature
```

### Step 2: Discussion
The agent will ask:
- "What's the format of CAN signals? Raw frames or decoded messages?"
- "Should this integrate with existing modalities or be separate?"
- "Any specific CAN protocols (J1939, UDS, etc.)?"
- "Performance requirements?"

### Step 3: Review Plan
Agent creates:
```
TASK-001-add-can-signal-parser.md
TASK-002-integrate-webhooks-with-api.md
TASK-003-update-model-for-can-modality.md
```

### Step 4: Implement
```bash
# For TASK-001
git checkout -b feature/can-signal-parser
# ... implement following the plan ...
git commit -m "feat: Add CAN signal parser (TASK-001)"
git push origin feature/can-signal-parser
# Create PR, reference TASK-001
```

## Task Plan Structure

Each task plan includes:
- **Clear objective** - What gets accomplished
- **Context** - Why it's needed
- **Dependencies** - What must be done first
- **Step-by-step plan** - Actionable implementation steps
- **TDD strategy** - Failing test first, minimal implementation, safe refactor
- **Files to change** - Specific paths and purposes
- **Testing requirements** - Unit and integration tests
- **Success criteria** - How to know it's complete
- **Technical notes** - Architecture decisions, gotchas

## Tips for Best Results

1. **Be Specific About Goals**
   - ❌ "Make the model better"
   - ✅ "Reduce inference latency by 30% while maintaining >95% accuracy"

2. **Provide Context**
   - Share why this is needed
   - Mention any constraints (time, resources, compatibility)
   - Note related work or dependencies

3. **Engage in Discussion**
   - Answer the agent's clarifying questions
   - Share your preferences and concerns
   - Ask questions if something's unclear

4. **Review Plans Before Starting**
   - Check if dependencies make sense
   - Verify effort estimates align with timeline
   - Suggest adjustments if needed

## Task Lifecycle

```mermaid
graph LR
    A[💡 Idea] --> B[@planner Discussion]
    B --> C[📝 Plan Created]
    C --> D[🔵 Planned]
    D --> E[🟡 In Progress]
    E --> F[👀 Review]
    F --> G[🟢 Complete]
    F --> |Changes Needed| E
    D --> |Blocked| H[🔴 Blocked]
    H --> |Unblocked| D
```

## Branch Strategy

The planner follows this naming convention:
- `feature/task-name` - New functionality
- `bugfix/issue-description` - Bug fixes
- `refactor/component-name` - Code restructuring
- `docs/topic` - Documentation
- `test/component-name` - Test additions

## Integration with Main Development

The Planner Agent **complements** the main Copilot:
- **Planner:** Strategic planning, task breakdown, workflow design
- **Copilot:** Code implementation, debugging, documentation writing

Typical flow:
1. Use `@planner` to create task plans
2. Use main Copilot to implement each task
3. Update task status in plan documents
4. Create PRs referencing task IDs

## Examples

### Example 1: New Feature
```
@planner We need to add support for streaming predictions during inference,
returning results incrementally as they're computed rather than waiting for
the full batch. This is for real-time dashboard integration.
```

### Example 2: Performance Optimization
```
@planner The data processor is a bottleneck. I'm seeing poor performance
60% GPU utilization. Can we plan improvements to achieve >90% utilization?
```

### Example 3: Architecture Migration
```
@planner I want to migrate from the current architecture to a more scalable approach
efficient Perceiver architecture. This needs to be done incrementally
without breaking existing checkpoints.
```

### Example 4: Technical Debt
```
@planner Let's create a plan to add proper type hints and comprehensive
docstrings to the model/ directory, following our clean code guidelines.
```

## Viewing Plans

All plans are in `dev/plans/`:
- `README.md` - Overview and task tracker
- `TASK-XXX-name.md` - Individual task plans
- `TASK-TEMPLATE.md` - Template for manual task creation

## Questions?

If the Planner Agent doesn't have enough information:
- It will ask clarifying questions
- Suggest alternatives with trade-offs
- Highlight risks and uncertainties

You can always refine plans through continued discussion:
```
@planner Actually, TASK-002 seems too large. Can we split it further?
```

---

Ready to start planning? Invoke with `@planner [your idea]`
