# Three-Agent TDD Development System Template

A reusable agentic workflow template for systematic software development using GitHub Copilot agents. This template implements a structured TDD-first process: Planning → Review → Implementation (RED → GREEN → REFACTOR).

## 🎯 What is This?

This repository provides a complete agent-based development workflow that can be adapted to any software project. It coordinates three specialized AI agents:

- **🎨 Planner Agent**: Creates detailed technical plans from high-level requirements
- **🔍 Reviewer Agent**: Evaluates plans for feasibility, quality, and completeness
- **⚙️ Coder Agent**: Implements approved plans with high code quality and strict TDD

## 🚀 Quick Start

### 1. Use This Template

Click "Use this template" on GitHub to create your own repository, or clone it:

```bash
git clone https://github.com/your-org/agentic-template.git your-project-name
cd your-project-name
```

### 2. Customize for Your Project

**Essential Customization:**

1. **Update [.github/copilot-instructions.md](.github/copilot-instructions.md)**:
   - Add your project overview and architecture
   - Specify your tech stack and dependencies
   - Define your coding conventions and standards
   - Add project-specific testing requirements

2. **Review Agent Configurations** in [.github/agents/](.github/agents/):
   - Agents will automatically reference your copilot-instructions.md
   - Optionally customize agent roles if needed

3. **Update Examples** (optional):
   - Modify [dev/plans/technical/TASK-001-example-plan.yaml](dev/plans/technical/TASK-001-example-plan.yaml) with relevant examples

See [PROJECT_SETUP_GUIDE.md](PROJECT_SETUP_GUIDE.md) for detailed customization instructions.

### 3. Start Using the Workflow

**Trigger the workflow by chatting with the Planner agent:**

```
@planner I want to implement user authentication
```

The agent system will guide you through the complete development lifecycle. See [Workflow Overview](#-workflow-overview) below.

## 📋 Workflow Overview

```
┌─────────────────────┐
│   User Request      │
│ "I want feature X"  │
└──────────┬──────────┘
           ↓
    ┌──────────────┐
    │   @planner   │  Creates detailed technical plan
    │   Agent      │  • Analyzes requirements
    │              │  • Designs solution
    │              │  • Breaks down into tasks
    └──────┬───────┘
           ↓
    ┌──────────────┐
    │  @reviewer   │  Evaluates plan quality
    │   Agent      │  • Checks feasibility
    │              │  • Validates completeness
    │              │  • Suggests improvements
    └──────┬───────┘
           ↓
    ┌──────────────┐
   │   @coder     │  Implements approved plan with TDD
    │   Agent      │  • Writes production code
   │              │  • RED: failing test first
   │              │  • GREEN: minimal code to pass
   │              │  • REFACTOR: cleanup with tests green
    │              │  • Follows conventions
    └──────────────┘
```

## 📋 Understanding Technical Plans

The **Technical Plan** is the core deliverable that bridges planning and implementation. It's a structured breakdown of work that enables systematic, atomic development.

### What is a Technical Plan?

A technical plan (`dev/plans/technical/TASK-XXX-technical-plan.yaml`) is an **executable implementation specification** created by the Reviewer Agent. It defines:

- **Atomic Subtasks**: 15-20 small, independent tasks (each ~0.5-2 hours)
- **TDD Cycle**: Each subtask includes RED → GREEN → REFACTOR expectations
- **Dependencies**: Which tasks must complete before others (enables parallelization)
- **Acceptance Criteria**: Measurable, testable success conditions for each step
- **File Boundaries**: Exactly which files can/cannot be modified (prevents scope creep)
- **Branch Strategy**: Each subtask gets a unique hierarchical branch
- **Commit Messages**: Standardized formats for clean git history

### Example Task from a Technical Plan

```yaml
- id: "2.2"
  title: "Implement CSVReader class"
  description: "Create CSV reading functionality with encoding detection"
  estimated_hours: 1.5
  depends_on: ["1.2", "2.1"]
  branch: "feature/csv-reader/2.2-reader-class"
  commit_message: "feat(csv-reader): implement CSVReader class"

  acceptance_criteria:
    - "✓ CSVReader.load_csv() method exists"
    - "✓ Supports UTF-8, Latin-1, cp1252 encodings"
    - "✓ All public methods have type hints"
    - "✓ All methods have docstrings (Google style)"
    - "✓ Unit tests pass with >85% coverage"

  allowed_files:
    - "src/csv_reader.py"
    - "tests/unit/test_csv_reader.py"

  forbidden_files:
    - "src/validator.py"  # Not yet implemented
```

### Why Technical Plans Matter

📋 **For Developers (Clarity & Guidance):**
- Zero ambiguity: Each task is tiny, specific, measurable
- Built-in checklist: Acceptance criteria are done-or-not-done
- Safe isolation: Each branch is independent, can work in parallel
- Git workflow: No guessing about branch names or commit messages

👥 **For Teams (Consistency & Coordination):**
- Every project follows the same structured process
- Easy to hand off mid-project to another developer
- Clear progress: "3 of 15 tasks complete" is immediately visible
- Code reviews aligned with task structure

✨ **For Quality (Correctness & Completeness):**
- File boundaries prevent accidental modifications outside scope
- Dependencies ensure nothing is merged out-of-order
- Testing built into every task, not added after
- Complete work: No orphaned code or missing pieces

### Reviewer Generates Technical Plans

When you invoke `@reviewer Review TASK-XXX`, the Reviewer Agent generates:

1. **Review Document** (`dev/reviews/REVIEW-TASK-XXX.md`)
   - Critical analysis and approval decision
   - Context for @coder about WHY decisions were made

2. **Technical Plan** (`dev/plans/technical/TASK-XXX-technical-plan.yaml`) ← **THIS IS THE IMPLEMENTATION GUIDE**
   - Atomic subtasks ready to implement
   - @coder follows this file step-by-step
   - No further planning needed

### Example Workflow

```bash
# 1. Planner creates plan
@planner Add CSV file reading functionality

# Creates: dev/plans/TASK-001-csv-reader.md

# 2. Reviewer evaluates and creates technical plan
@reviewer Review TASK-001

# Creates:
#   - dev/reviews/REVIEW-TASK-001.md (analysis & approval)
#   - dev/plans/technical/TASK-001-technical-plan.yaml (15 subtasks)

# 3. Coder implements from technical plan
@coder Implement TASK-001

# Coder reads TASK-001-technical-plan.yaml and:
# - Creates branch: feature/csv-reader/1.1-setup-structure
# - Implements task 1.1 with acceptance criteria
# - Commits with message: "feat(csv-reader): initialize project structure"
# - Creates branch: feature/csv-reader/1.2-config-module
# - Implements task 1.2
# ... continues until all 15 tasks complete ...
```

## 🚀 Workflow Example

```bash
# 1. Start with the Planner
You: @planner Add CSV file validation with error reporting

Planner: [Creates TASK-XXX-csv-validation.yaml with detailed plan]

# 2. Review the plan
You: @reviewer Review TASK-XXX

Reviewer: [Evaluates plan, suggests improvements]

# 3. Implement
You: @coder Implement TASK-XXX

Coder: [Creates feature branch, implements code, writes tests]
```

## 📁 Repository Structure

```
agentic-template/
├── .github/
│   ├── copilot-instructions.md      # Project guidelines (customize this!)
│   ├── workflows/
│   │   ├── python-test.yml           # Hard lint/type/test gate
│   │   ├── terraform-validate.yml    # Terraform validation gate
│   │   └── workflow-consistency.yml  # Plan/review/path consistency gate
│   └── agents/                       # Agent configurations
│       ├── planner.agent.md         # Planning agent
│       ├── reviewer.agent.md        # Review agent
│       ├── coder.agent.md           # Implementation agent
│       ├── docs/
│       │   ├── README.md             # System overview
│       │   └── guides/
│       │       ├── AGENT-WORKFLOW-GUIDE.md  # Workflow reference
│       │       ├── PLANNER_GUIDE.md  # Planner guide
│       │       ├── REVIEWER_GUIDE.md # Reviewer guide
│       │       └── CODER_GUIDE.md    # Coder guide
├── dev/
│   ├── plans/                        # Planning artifacts
│   │   ├── TASK-TEMPLATE.md         # Plan template
│   │   ├── technical/               # Approved technical plans
│   │   └── implementations/         # Optional implementation logs
│   ├── reviews/                      # Plan reviews
│       └── REVIEW-TEMPLATE.md       # Review template
│   └── tools/
│       └── validate_agent_workflow.py # Local consistency validator
├── README.md                         # This file
└── PROJECT_SETUP_GUIDE.md           # Customization guide
```

## ✨ Key Features

### Structured Development Process
- **Phased Approach**: Plan → Review → Implement (no skipping phases)
- **TDD by Default**: RED failing test first, GREEN minimal implementation, REFACTOR safely
- **Clear Documentation**: Every feature gets a detailed technical plan
- **Quality Gates**: Built-in review process before implementation

### Technical Plans (Core Feature)
- **Atomic Subtasks**: Complex features broken into small, implementable steps
- **Acceptance Criteria**: Every subtask has measurable success criteria
- **TDD Acceptance Criteria**: Every subtask defines RED → GREEN → REFACTOR expectations
- **Branch per Task**: Each subtask gets its own feature branch for isolation
- **Implementation Guide**: YAML format with dependencies, effort, file boundaries
- **Git Workflow Specs**: Commit messages and branching strategy pre-defined
- **Coder-Ready**: Technical plans are immediately executable without ambiguity

### Branch Management
- **Hierarchical Branch Names**: `feature/{parent-slug}/{phase}.{number}-{description}`
- **Automatic Branch Creation**: Each subtask has a dedicated branch, safe for parallel work
- **Clean Git History**: Isolated changes for easier code review
- **Safe Experimentation**: Easy to abandon or modify without affecting main

### Code Quality Standards
- **Type Annotations**: Required for all functions
- **Comprehensive Testing**: >80% coverage target
- **Documentation**: Docstrings and strategic comments
- **Consistent Style**: Project-specific conventions enforced

### Governance & Automation
- **Canonical Paths**: `dev/plans/`, `dev/reviews/`, `dev/plans/technical/`
- **Canonical Checks**: `python-lint-and-test`, `terraform-validate`, `workflow-consistency`
- **Status Source of Truth**: Technical plan (`dev/plans/technical/TASK-XXX-technical-plan.yaml`)
- **Pre-PR Validator**: `python dev/tools/validate_agent_workflow.py`

### Flexible & Adaptable
- **Framework Agnostic**: Works with any tech stack
- **Language Independent**: Python, JavaScript, Go, etc.
- **Project Size**: Suitable for small tools to large systems

## ✅ Repository Updates Applied (June 2026)

The following concrete updates are now part of this repository setup:

1. **Path normalization completed**
   - Unified all agent/documentation references to `dev/plans/`, `dev/reviews/`, and `dev/plans/technical/`.

2. **TDD-first agent behavior enabled**
   - Planner now decomposes work into RED → GREEN → REFACTOR slices.
   - Reviewer now checks TDD readiness and requires TDD acceptance criteria.
   - Coder now executes every subtask with failing test first.

3. **Hard Python quality gate enabled**
   - `.github/workflows/python-test.yml` no longer allows lint/type failures.
   - MyPy scope broadened to `src/etl/data_collection/`.
   - Coverage threshold enforced with `--cov-fail-under=80`.

4. **Workflow consistency automation added**
   - New script: `dev/tools/validate_agent_workflow.py`.
   - New CI job: `.github/workflows/workflow-consistency.yml`.
   - Validator checks legacy path drift, status consistency, and required check names.

5. **Status synchronization model introduced**
   - Technical plan progress is now the authoritative status source.
   - Plan overview files mirror technical-plan progress.

6. **Canonical required checks established**
   - `python-lint-and-test`
   - `terraform-validate`
   - `workflow-consistency`

## 📚 Documentation

- **[.github/agents/docs/README.md](.github/agents/docs/README.md)**: Detailed system overview
- **[.github/agents/docs/guides/AGENT-WORKFLOW-GUIDE.md](.github/agents/docs/guides/AGENT-WORKFLOW-GUIDE.md)**: Quick workflow reference
- **[PROJECT_SETUP_GUIDE.md](PROJECT_SETUP_GUIDE.md)**: Customization instructions

### Per-Agent Guides
- **[Planner Guide](.github/agents/docs/guides/PLANNER_GUIDE.md)**: How to work with the planning agent
- **[Reviewer Guide](.github/agents/docs/guides/REVIEWER_GUIDE.md)**: How to evaluate and approve plans
- **[Coder Guide](.github/agents/docs/guides/CODER_GUIDE.md)**: Implementation agent details

## 🎯 Use Cases

This template works well for:

- **Feature Development**: Adding new functionality systematically
- **Bug Fixes**: Planning complex fixes before implementation
- **Refactoring**: Structured approach to code improvements
- **Architecture Changes**: Breaking down large system changes
- **Team Projects**: Consistent process across team members

## 🤝 Contributing

This is a template repository. Contributions to improve the template itself are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your improvements
4. Submit a pull request

## 📄 License

This template is provided as-is for use in your projects. Modify and adapt as needed.

## 🆘 Troubleshooting

**Agents not responding?**
- Ensure you're using `@planner`, `@reviewer`, or `@coder` mentions
- Check that agent files exist in `.github/agents/`

**Getting generic responses?**
- Customize [.github/copilot-instructions.md](.github/copilot-instructions.md) with your project details

**Need help?**
- Review the detailed documentation in `.github/agents/docs/`
- Check example plans in `dev/plans/technical/`

---

**Ready to start?** Follow the [Quick Start](#-quick-start) guide above, then trigger the workflow with `@planner [your feature request]`
