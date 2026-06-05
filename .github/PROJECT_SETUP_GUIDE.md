# Project Setup Guide

This guide walks you through customizing the three-agent development system template for your specific project.

## 📋 Table of Contents

1. [Initial Setup](#initial-setup)
2. [Customize Project Guidelines](#customize-project-guidelines)
3. [Review Agent Configurations](#review-agent-configurations)
4. [Update Example Plans (Optional)](#update-example-plans-optional)
5. [Verification Checklist](#verification-checklist)
6. [Next Steps](#next-steps)

## Initial Setup

### 1. Clone or Use Template

**Option A: Use this as a GitHub template**
```bash
# Click "Use this template" on GitHub, then clone your new repo
git clone https://github.com/your-org/your-project.git
cd your-project
```

**Option B: Clone directly**
```bash
git clone https://github.com/your-org/agentic-template.git your-project
cd your-project
rm -rf .git  # Remove template git history
git init     # Start fresh
```

### 2. Update Repository Name

Update any references to the template name in:
- [README.md](README.md) - Replace template description with your project
- Package/configuration files (if any)

## Customize Project Guidelines

### 📝 Primary File: `.github/copilot-instructions.md`

This is the **most important file to customize**. It defines your project's coding standards, architecture, and conventions that all agents will follow.

**What to replace:**

#### 1. Project Overview Section
```markdown
## Project Overview

<!-- Replace with your actual project -->
MyAwesomeProject is a REST API for managing user data, built with FastAPI and PostgreSQL.
It provides authentication, CRUD operations, and real-time notifications.

**Key Features:**
- JWT-based authentication
- PostgreSQL database with SQLAlchemy ORM
- Redis caching layer
- WebSocket support for real-time updates
```

#### 2. Architecture Section
```markdown
## Architecture

### Core Components
- **API Layer** (`src/api/`): FastAPI routers and endpoints
  - `auth.py`: Authentication routes (login, register, refresh)
  - `users.py`: User management endpoints
  - `notifications.py`: WebSocket notification handlers

- **Business Logic** (`src/services/`): Core application logic
  - `user_service.py`: User operations and validation
  - `auth_service.py`: Token generation and verification
  - `notification_service.py`: Real-time notification dispatch

- **Data Layer** (`src/models/`): Database models and schemas
  - SQLAlchemy ORM models
  - Pydantic schemas for validation

### Data Flow
1. **Request** → FastAPI endpoint → Validate with Pydantic
2. **Process** → Service layer → Business logic + validation
3. **Persist** → SQLAlchemy → PostgreSQL database
4. **Cache** → Redis → Frequently accessed data
5. **Response** → JSON serialization → Client
```

#### 3. Tech Stack Section
```markdown
## Tech Stack

- **Language**: Python 3.11
- **Framework**: FastAPI 0.104
- **Database**: PostgreSQL 15 with SQLAlchemy 2.0
- **Caching**: Redis 7.0
- **Testing**: pytest, pytest-asyncio
- **Other**:
  - Alembic (database migrations)
  - Pydantic (validation)
  - python-jose (JWT)
  - WebSockets (real-time)
```

#### 4. Project-Specific Conventions

**Add sections relevant to your project:**

```markdown
## API Design Conventions

- All endpoints use RESTful principles
- Versioning via URL: `/api/v1/...`
- Use plural nouns for resources: `/users`, `/posts`
- Standard HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad request
  - 401: Unauthorized
  - 404: Not found
  - 500: Server error

## Database Conventions

- Table names: lowercase, plural (e.g., `users`, `posts`)
- Primary keys: `id` (UUID)
- Timestamps: `created_at`, `updated_at` (always include)
- Foreign keys: `{table}_id` (e.g., `user_id`)
- Indexes: Add for frequently queried fields

## Error Handling

All exceptions should use custom exception classes:
```python
from fastapi import HTTPException

class UserNotFoundError(HTTPException):
    def __init__(self, user_id: str):
        super().__init__(
            status_code=404,
            detail=f"User {user_id} not found"
        )
```

**Keep the Clean Code Principles and Testing Requirements sections** - they're generic and work for most projects. Just update the examples to match your tech stack.

### 🎨 Update Code Examples

Replace the generic examples in copilot-instructions.md with ones from your domain:

**Before (Generic):**
```python
def validate_user_input(data: dict, required_fields: List[str]) -> dict:
    """Validate user input data against required fields."""
```

**After (Your Project):**
```python
def validate_user_credentials(email: str, password: str) -> User:
    """
    Validate user credentials for authentication.

    Args:
        email: User email address (must be valid format)
        password: Plain text password (will be hashed)

    Returns:
        User object if credentials valid

    Raises:
        InvalidCredentialsError: If email/password incorrect
    """
```

## Review Agent Configurations

The agent files in `.github/agents/` are already generic, but you may want to:

### Optional Customizations

**`.github/agents/planner.agent.md`**
- Add project-specific planning considerations
- Include domain-specific terminology

**`.github/agents/reviewer.agent.md`**
- Add project-specific review criteria
- Include architecture decision guidelines

**`.github/agents/coder.agent.md`**
- Add project-specific implementation patterns
- Include deployment considerations

**Most projects can use these files as-is** - they automatically reference `copilot-instructions.md` for project-specific guidelines.

## Update Example Plans (Optional)

### Replace `dev/plans/technical/TASK-001-example-plan.yaml`

The current example is a generic CSV validation pipeline. Consider replacing it with an example relevant to your domain:

**For a Web API project:**
```yaml
metadata:
  for_task: "TASK-001-add-user-authentication"
  # ... your authentication feature example
```

**For a Data Processing project:**
```yaml
metadata:
  for_task: "TASK-001-etl-pipeline"
  # ... your ETL pipeline example
```

**For a Machine Learning project:**
```yaml
metadata:
  for_task: "TASK-001-model-training-pipeline"
  # ... your training pipeline example
```

Or **keep the generic example** if it's sufficient for demonstrating the workflow.

## Verification Checklist

Before using the system, verify:

### ✅ Mandatory
- [ ] `.github/copilot-instructions.md` updated with:
  - [ ] Project overview and description
  - [ ] Architecture and components
  - [ ] Tech stack
  - [ ] Project-specific conventions (if any)
- [ ] Main `README.md` mentions your project (optional)

### ✅ Recommended
- [ ] Code examples in copilot-instructions.md match your tech stack
- [ ] Testing framework specified (pytest, Jest, etc.)
- [ ] At least one example technical plan relevant to your domain

### ✅ Optional
- [ ] Agent files customized for domain-specific needs
- [ ] Additional project conventions documented

## Quick Verification

Run a test to ensure agents understand your project:

```
@planner What are the key conventions for this project?
```

**Expected response:** Should reference your tech stack, architecture, and conventions from copilot-instructions.md.

If the agent gives generic answers, review your copilot-instructions.md customization.

## Next Steps

### Start Using the System

1. **Think of a feature or task** you want to implement

2. **Invoke the Planner:**
   ```
   @planner I want to add [your feature description]
   ```

3. **Follow the workflow:**
   ```
   @planner [feature] → @reviewer [review plan] → @coder [implement]
   ```

### Example First Task

**For a REST API:**
```
@planner I want to add user registration endpoint with email validation
```

**For a Data Pipeline:**
```
@planner I want to add data quality checks to the ETL pipeline
```

**For a Web App:**
```
@planner I want to add user authentication with OAuth2
```

The agents will guide you through the complete development process!

## Troubleshooting

### Agents don't understand my project context

**Solution:** Your `.github/copilot-instructions.md` needs more detail. Add:
- Specific file/folder structure
- Key design patterns you use
- Technology-specific conventions

### Agents suggest wrong technologies

**Solution:** Clearly specify your tech stack in copilot-instructions.md:
```markdown
## Tech Stack
- **DO USE**: FastAPI, SQLAlchemy, pytest
- **DO NOT USE**: Django, Flask (we've standardized on FastAPI)
```

### Plans are too generic

**Solution:** Add domain-specific examples in copilot-instructions.md showing your preferred patterns and conventions.

## Need Help?

- Review [.github/agents/docs/README.md](.github/agents/docs/README.md) for system documentation
- Check [.github/agents/docs/README.md](.github/agents/docs/README.md) for detailed documentation
- Check [.github/agents/docs/guides/AGENT-WORKFLOW-GUIDE.md](.github/agents/docs/guides/AGENT-WORKFLOW-GUIDE.md) for quick workflow reference
- Look at example plans in `dev/plans/technical/` for format guidance

---

**Ready to start?** Complete the [Verification Checklist](#verification-checklist) above, then invoke `@planner` with your first feature request!
