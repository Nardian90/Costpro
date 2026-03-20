# AI Controller Architecture (Darian)

## Overview
Darian acts as the intelligent interface between the user and the CostPro application. It transforms natural language into actionable system commands.

## Components
1. **BotService**: Orchestrates the conversation, handles tool-calling loops, and manages persistence/logging.
2. **LLM Adapters**: Abstraction layer for different providers (Gemini, GPT, etc.).
3. **Tool Registry**: Centralized logic for tool execution, validation (Zod), and security (RBAC).
4. **View Registry**: Mapping of system views used for AI navigation.

## Execution Flow
1. User sends message via `ChatBot.tsx`.
2. `bot-service.ts` constructs the system prompt with context (Store ID, User Role, View Registry).
3. LLM decides whether to respond with text or call a tool.
4. `executeTool` validates permissions and parameters before performing actions.
5. `audit_logs` records the entire interaction for traceability.
