/**
 * xibecode-core - XibeCode AI Agent Engine
 *
 * Public API for the XibeCode core engine.
 *
 * @module xibecode-core
 */

// ─── Types ─────────────────────────────────────────────────────
export { PROVIDER_CONFIGS, type ProviderType } from './types/index.js';
export { type MCPServerConfig, type MCPServersConfig, type MCPServerConfigLegacy } from './types/index.js';
export { type ImageAttachment } from './types/index.js';
export { type TodoStatus, type TodoItem, type TodoDocument } from './types/index.js';

// ─── Agent ─────────────────────────────────────────────────────
export { EnhancedAgent } from './agent.js';

// ─── Tools ─────────────────────────────────────────────────────
export { CodingToolExecutor } from './tools.js';

// ─── MCP ───────────────────────────────────────────────────────
export { MCPClientManager } from './mcp-client.js';

// ─── Modes ─────────────────────────────────────────────────────
export {
  type AgentMode,
  type ToolCategory,
  type ModeCapabilities,
  ENABLED_MODES,
  MODE_CONFIG,
  isToolAllowed,
  getAllowedTools,
  isEnabledMode,
  isValidMode,
  getAllModes,
  type ModeState,
  type ModeTransitionRequest,
  type AutoApprovalPolicy,
  type ModeTransitionPolicy,
  ModeOrchestrator,
  createModeState,
  transitionMode,
  requiresModeTransitionConfirmation,
  getModeTransitionMessage,
  parseModeRequest,
  stripModeRequests,
  parseTaskComplete,
  stripTaskComplete,
  getToolCategory,
} from './modes.js';

// ─── Memory ────────────────────────────────────────────────────
export { NeuralMemory } from './memory.js';

// ─── Skills ────────────────────────────────────────────────────
export { SkillManager } from './skills.js';

// ─── Plugins ───────────────────────────────────────────────────
export { type XibeCodePlugin, PluginManager, examplePlugin } from './plugins.js';

// ─── Session ───────────────────────────────────────────────────
export { SessionManager, type ChatSession, type SessionMetadata } from './session-manager.js';
export { SessionBridge, type BridgeMessage } from './session-bridge.js';
export { SessionMemory } from './session-memory.js';

// ─── Plan ──────────────────────────────────────────────────────
export { PlanMode, type PlanResult } from './planMode.js';
export { PlanSessionManager, type PlanSession } from './plan-session.js';
export { type PersistedPlanArtifact, persistPlanArtifact, loadLatestPlanArtifact } from './plan-artifacts.js';

// ─── Context ───────────────────────────────────────────────────
export { ContextManager } from './context.js';
export { pruneContext } from './context-pruner.js';
export { type CompactionResult, compactConversation } from './context-compactor.js';

// ─── Swarm ─────────────────────────────────────────────────────
export { SwarmOrchestrator, type SubtaskResult, DEFAULT_SWARM_MAX_PARALLEL } from './swarm.js';

// ─── Permissions ───────────────────────────────────────────────
export { type PermissionMode, type ApprovalScope, type ToolPermissionContext, type ToolPermissionDecision, PermissionManager } from './permissions.js';
export { PermissionStore } from './permission-store.js';

// ─── Settings ──────────────────────────────────────────────────
export { SettingsManager, type SettingsManagerOptions } from './settings/settings.js';
export { type SettingsSchema, type SettingsSource, type SettingsSourceEntry, type PermissionSettings, type HookEvent as SettingsHookEvent, type HookMatcher, type HookConfig as SettingsHookConfig, type CommandHook, type PromptHook, type AgentHook, type HttpHook } from './settings/settings-types.js';
export { mergeSettings, mergeSettingsStack } from './settings/settings-merge.js';

// ─── Permission Rules ──────────────────────────────────────────
export { PermissionRuleManager, type RuleEvaluationResult } from './permission-rules/permission-rules.js';
export { parseRule, patternToRegex, type ParsedRule } from './permission-rules/rule-parser.js';
export { evaluateRules, findMatchingRule, matchRule, parseRulesFromStrings, type PermissionRule, type RuleBehavior, type ToolCallInfo, type MatchResult } from './permission-rules/rule-matcher.js';

// ─── Hooks ─────────────────────────────────────────────────────
export { HooksManager } from './hooks/hooks.js';
export { executeHook } from './hooks/hook-executor.js';
export { validateHookConfig, validateHookMatcher, validateHooksConfig } from './hooks/hook-schema.js';
export { type HookEvent, type HookConfig, type HookContext, type HookResult, type HookMatcher as HookMatcherType, type CommandHookConfig, type PromptHookConfig, type AgentHookConfig, type HttpHookConfig, type FunctionHookConfig, type RegisteredHook, type BaseHookConfig } from './hooks/hook-types.js';

// ─── Auto-Memory ───────────────────────────────────────────────
export { AutoMemoryManager } from './auto-memory/auto-memory.js';
export { scanMemories, getMemoryDir, getMemoryEntrypoint, ensureMemoryDir, parseFrontmatter, serializeMemory } from './auto-memory/memory-scan.js';
export { findRelevantMemories, formatMemoriesForContext as formatAutoMemoriesForContext } from './auto-memory/find-relevant.js';
export { extractMemoriesFromTurn, writeExtractedMemories } from './auto-memory/extract-memories.js';
export { runDreamConsolidation, shouldRunDream } from './auto-memory/dream.js';
export { type AutoMemoryConfig, type MemoryFile, type MemoryFrontmatter, type MemoryType, type ExtractedMemory, type DreamConsolidationResult } from './auto-memory/memory-types.js';

// ─── Microcompact ──────────────────────────────────────────────
export { microcompact, estimateTokenCount, shouldAutoCompact, resetMicrocompactCircuitBreaker, type MicrocompactResult, type MicrocompactOptions } from './microcompact.js';

// ─── History ───────────────────────────────────────────────────
export { HistoryManager, type HistoryMessage, type SavedConversation, type ConversationSummary } from './history-manager.js';

// ─── Editor ────────────────────────────────────────────────────
export { FileEditor, type EditResult, type SearchReplaceEdit, type LineRangeEdit, type VerifiedEdit } from './editor.js';

// ─── Background Agent ──────────────────────────────────────────
export { BackgroundAgentManager, type BackgroundTask } from './background-agent.js';

// ─── Tool Orchestrator ─────────────────────────────────────────
export { ToolOrchestrator } from './tool-orchestrator.js';

// ─── Safety ────────────────────────────────────────────────────
export { type RiskLevel, type RiskAssessment, SafetyChecker, sanitizePath, sanitizeUrl } from './utils/safety.js';

// ─── Core Utils ────────────────────────────────────────────────
export { GitUtils } from './utils/git.js';
export { TestRunnerDetector } from './utils/testRunner.js';
export { MCPServersFileManager } from './utils/mcp-servers-file.js';
export { extractAtReferences, splitAtReferences } from './utils/at-references.js';
export { SmitheryClient } from './utils/smithery.js';
export { autoLoadProjectMemories, formatMemoriesForContext, type LoadedMemory, type ProjectMemoryContext } from './utils/auto-memory.js';
export { TodoManager } from './utils/todoManager.js';

// ─── MCP internals ─────────────────────────────────────────────
export { type McpServersJson, normalizeMcpServersConfig, readMcpServersFromFile, findProjectMcpConfigFiles } from './mcp/mcp-config.js';
export { type ResolvedMcpServers, resolveMcpServers } from './mcp/resolve-mcp-servers.js';
export { type OAuthStartResult, type OAuthFinishResult, type PendingOAuth, McpOAuthFlowManager } from './mcp/oauth-flow.js';
export { type OAuthTokenRecord, type OAuthTokenFile, readOAuthTokens, writeOAuthTokens, upsertOAuthToken } from './mcp/oauth-store.js';

// ─── Other core modules ────────────────────────────────────────
export { fetchPage, stripHtml, extractLinks, type ScrapedPage, crawlDocs } from './docs-scraper.js';
export { ConflictSolver } from './conflict-solver.js';
export { CodeGraph } from './code-graph.js';
export { type DebugSnapshot, buildDebugSnapshot } from './debug-workflow.js';
export { PatternMiner } from './pattern-miner.js';
export { MemoryPromotions } from './memory-promotions.js';
export { type TranscriptCleanupResult, cleanupTranscript } from './transcript-cleanup.js';
export { type TaskLifecycleStatus, type TaskStatusSnapshot, TaskStatusStore } from './task-status.js';
export { type ConversationRecoveryResult, recoverConversation } from './conversation-recovery.js';
export { MarketplaceClient } from './marketplace-client.js';
export { type AgentExecutionRole, applyAgentToolPolicy, getWorkerBlockedTools } from './agent-tool-policies.js';
export { type SkillLike, type SkillSelectionOptions, tokenizeTaskPrompt, extractDepTokens, scoreSkillRelevance, selectRelevantBuiltInSkills, formatSelectionSummary } from './skill-selection.js';
export { SkillsShClient } from './skills-sh-client.js';
export { type ExportMetadata, exportMessagesToMarkdown, exportSessionToMarkdown } from './export.js';
