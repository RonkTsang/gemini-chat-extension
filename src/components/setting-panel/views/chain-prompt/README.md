# Chain Prompt Feature

The Chain Prompt feature allows users to create and manage chained prompts consisting of multiple steps, enabling the automated execution of complex tasks.

## Feature Overview

### Core Features
- ✅ Create, edit, duplicate, and delete Chain Prompts
- ✅ Define input variables (with support for default values)
- ✅ Multi-step orchestration (with drag-and-drop sorting)
- ✅ Template variable system (`{{VAR}}` and `{{StepN.output}}`)
- ✅ Pre-run preview (real-time rendering)
- ✅ Automatic execution (Insert → Send → Wait → Continue)
- ✅ Search and filtering

## Architecture

### Data Layer
- **Database**: IndexedDB (`gemini_extension`) via Dexie
- **Tables**: `chain_prompts` (Template persistence)
- **Repository**: `chainPromptRepository` (Unified data access interface)
- **Data Source**: `LocalDexieDataSource` (Local storage implementation)

### Business Layer
- **Template Engine**: `templateEngine` - Handles variable parsing and validation
- **Execution Service**: `chainPromptExecutor` - Drives the step execution flow
- **State Management**: `chainPromptStore` (Zustand) - Manages UI state

### UI Layer
- **List Page**: `index.tsx` - Displays all Chain Prompts
- **Edit Page**: `editor.tsx` - Create/Edit interface
- **Run Modal**: `RunModal.tsx` - Variable input and preview

## File Structure

```
src/
├── domain/chain-prompt/
│   └── types.ts                    # Domain type definitions
├── data/
│   ├── db.ts                       # Dexie database configuration
│   ├── sources/
│   │   └── LocalDexieDataSource.ts # Local data source implementation
│   └── repositories/
│       └── chainPromptRepository.ts # Repository implementation
├── services/
│   ├── templateEngine.ts           # Template parsing engine
│   └── chainPromptExecutor.ts      # Execution service
├── stores/
│   └── chainPromptStore.ts         # UI state management
└── components/setting-panel/views/chain-prompt/
    ├── index.tsx                   # List view
    ├── editor.tsx                  # Edit view
    ├── RunModal.tsx                # Run modal
    └── README.md                   # This document
```

## Usage Examples

### Creating a Chain Prompt

1. Open Setting Panel → Chain Prompt
2. Click "New Chain Prompt"
3. Fill in the name and description
4. (Optional) Define input variables
5. Add steps and write your prompts
6. Use `{{VAR}}` to reference variables, and `{{StepN.output}}` to reference output from previous steps
7. Save

### Running a Chain Prompt

1. Find the target Chain Prompt in the list
2. Click the "Run" button
3. Fill in the variable values in the modal
4. Review the preview on the right
5. Click "Execute" to start the process

### Variable System

**Input Variables**:
- Format: `{{VARIABLE_KEY}}`
- Examples: `{{TOPIC}}`, `{{TONE}}`

**Step Output References**:
- Format: `{{StepN.output}}` (N is 1-based)
- Examples: `{{Step1.output}}`, `{{Step2.output}}`
- Restriction: Can only reference output from preceding steps

## Technical Details

### Execution Flow

1. User clicks Run → Opens RunModal
2. User fills variables → Real-time preview of rendered prompts
3. User clicks Execute → Process starts
4. For each step:
   - Render template (replace variables)
   - Insert into Gemini input box
   - Send message
   - Monitor model status changes
   - Wait for response completion
   - Extract output and save to context
5. All steps complete → Show result

### Data Storage

- **Local First**: V1 uses IndexedDB for local storage only
- **Cloud Ready**: Architecture is prepared for cloud migration (DataSource abstraction)
- **Execution Logs**: V1 does not persist execution history (page-level memory state only)

### Validation Rules

- Chain Prompt must have a name
- Must contain at least one step
- All steps must have prompt content
- Variable keys cannot be duplicated
- Steps can only reference defined variables and output from previous steps

## Future Extensions

- [ ] Persistence of execution history
- [ ] Import/Export as JSON
- [ ] Tags and categories
- [ ] Cloud synchronization
- [ ] Template marketplace/sharing
- [ ] Conditional branching and loops
- [ ] Enhanced retry and error handling
