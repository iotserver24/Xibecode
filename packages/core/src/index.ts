/**
 * xibecode-core - XibeCode AI Agent Engine
 *
 * Public API for the XibeCode core engine.
 *
 * @module xibecode-core
 */

// ─── Types ─────────────────────────────────────────────────────
export {
  PROVIDER_CONFIGS,
  SETUP_PROVIDER_PRIORITY,
  listSetupProviders,
  resolveProviderEnvApiKey,
  type ProviderType,
  type ProviderWireFormat,
  type ProviderConfigEntry,
  type SetupProviderOption,
} from './types/index.js';

// ─── Stop hooks (Claude-style verify-on-stop) ──────────────────
export {
  evaluateStopHooks,
  type StopHookMode,
  type StopHookInput,
  type StopHookResult,
} from './stop-hooks.js';

// ─── Tool result budget + batch summaries ─────────────────────
export {
  applyToolResultBudget,
  formatToolBatchSummary,
  extractPathFromToolInput,
  type ToolResultBlock,
  type ToolBatchItem,
} from './tool-result-budget.js';

// ─── Models catalog (live /models + curated fallbacks) ─────────
export {
  fetchProviderModels,
  resolveProviderEndpoint,
  listProviderCatalog,
  listAllProvidersCatalog,
  CURATED_PROVIDER_MODELS,
  type FetchModelsOptions,
  type FetchModelsResult,
} from './models-catalog.js';

// ─── models.dev (109+ providers community registry) ────────────
export {
  fetchModelsDevRegistry,
  listModelsDevProviders,
  getModelsDevProvider,
  modelsDevModelIds,
  resolveModelsDevEndpoint,
  normalizeModelsDevId,
  wireFormatFromNpm,
  type ModelsDevProvider,
  type ModelsDevModel,
} from './models-dev.js';
export { type MCPServerConfig, type MCPServersConfig, type MCPServerConfigLegacy } from './types/index.js';
export { type ImageAttachment } from './types/index.js';
export { type TodoStatus, type TodoItem, type TodoDocument } from './types/index.js';
export {
  type StreamEventType,
  type StreamEvent,
  type ThinkingEvent,
  type TextDeltaEvent,
  type ToolCallStartEvent,
  type ToolCallEndEvent,
  type ModeChangedEvent,
  type WarningEvent,
  type ErrorEvent,
  type CompleteEvent,
  type CancelledEvent,
  type StreamOptions,
} from './types/index.js';

// ─── Agent ─────────────────────────────────────────────────────
export { EnhancedAgent } from './agent.js';

// ─── Provider pool (failover / higher connection reliability) ──
export {
  ProviderPool,
  parseFallbackProviders,
  shouldFailoverProvider,
  type ProviderEndpoint,
} from './provider-pool.js';

// ─── Cron (scheduled agent tasks for 24/7 gateway) ─────────────
export {
  parseSchedule,
  nextRunAt,
  defaultRepeat,
  listJobs,
  getJob,
  createJob,
  updateJob,
  removeJob,
  pauseJob,
  resumeJob,
  dueJobs,
  completeJobRun,
  withTickLock,
  jobsPath,
  outputDir,
  startCronScheduler,
  type ParsedSchedule,
  type ScheduleKind,
  type CronJob,
  type CronDelivery,
  type CronStore,
  type CreateJobInput,
  type JobRunResult,
  type CronJobRunner,
  type SchedulerOptions,
} from './cron/index.js';

// ─── Learning loop (curated memory, session search, skill learn) ──
export {
  CuratedMemoryStore,
  searchSessions,
  draftSkillFromRun,
  saveLearnedSkill,
  shouldLearnSkill,
  learnedSkillsDir,
  runPostTurnReview,
  stageWrite,
  listPending,
  getPending,
  rejectPending,
  rejectAll,
  setWriteApproval,
  isWriteApprovalEnabledAsync,
  approvePending,
  approveAll,
  indexSessionDocument,
  indexSessionFile,
  ftsSearch,
  llmPostTurnReview,
  resolveReviewLlmConfig,
  type CuratedTarget,
  type CuratedMemoryConfig,
  type SessionHit,
  type LearnedSkillDraft,
  type SkillLearnResult,
  type ReviewStats,
  type ReviewResult,
  type PendingWrite,
  type PendingKind,
  type LlmReviewSuggestion,
  type LlmReviewConfig,
} from './learning-loop/index.js';

// ─── Agent Stream ───────────────────────────────────────────────
export { AgentStream } from './agent-stream.js';

// ─── Tools ─────────────────────────────────────────────────────
export { CodingToolExecutor } from './tools.js';
export { type RemoteExecutionConfig, RemoteExecutionClient } from './remote-execution.js';
export { RemoteWorkspaceClient } from './remote-workspace-client.js';

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
  parsePlanReady,
  stripPlanReady,
  parseQuestions,
  stripQuestions,
  type ParsedQuestion,
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

// ─── Transcript ────────────────────────────────────────────────
export { TranscriptWriter, getTranscriptWriter, appendEntryToFile } from './transcript-writer.js';
export { loadTranscriptFile, findMainConversationTip, buildConversationChain, loadMessagesFromJsonlPath, listSessionsLite, readHeadAndTail, readFileTailSync, loadSessionMetadata } from './transcript-reader.js';
export { type Entry, type TranscriptMessage, type MetadataEntry, type UserTranscriptEntry, type AssistantTranscriptEntry, type SystemTranscriptEntry, type AttachmentTranscriptEntry, type SummaryTranscriptEntry, type CustomTitleTranscriptEntry, type TagTranscriptEntry, type LastPromptTranscriptEntry, type CompactBoundaryTranscriptEntry, type FileHistorySnapshotEntry, type SessionMetaTranscriptEntry, type FileHistoryBackupRef, type FileHistorySnapshot, type SessionInfo, type LiteSessionFile, isTranscriptMessage, isChainParticipant, isMetadataEntry, validateUuid, generateUuid, extractJsonStringField, extractLastJsonStringField } from './transcript-types.js';
export { recoverConversationV2, assertResumeMessageSize, ResumeTranscriptTooLargeError, type TurnInterruptionState, type DeserializeResult } from './conversation-recovery-v2.js';
export { registerCleanup, runCleanupFunctions, gracefulShutdown, gracefulShutdownSync, setupGracefulShutdown, isShuttingDown } from './graceful-shutdown.js';
export { FileEditor, type EditResult, type SearchReplaceEdit, type LineRangeEdit, type VerifiedEdit } from './editor.js';

// ─── File History ───────────────────────────────────────────────
export { createBackup as fhCreateBackup, restoreBackup as fhRestoreBackup, fileHistoryTrackEdit, fileHistoryMakeSnapshot, fileHistoryRewind, fileHistoryCanRestore, fileHistoryRestore, createFileHistoryState, normalizeTrackingPath, checkOriginFileChanged, getBackupFileName, getFileHistoryDir, type FileHistoryState, type DiffStats } from './file-history.js';

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
export { type HookEvent, type HookConfig, type HookContext, type HookResult, type HookMatcher as HookMatcherType, type CommandHookConfig, type PromptHookConfig, type AgentHookConfig, type HttpHookConfig, type FunctionHookConfig, type RegisteredHook, type BaseHookConfig, HOOK_EVENTS } from './hooks/hook-types.js';

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

// ─── Editor (re-exported under Transcript section above) ───────

// ─── Background Agent ──────────────────────────────────────────
export { BackgroundAgentManager, type BackgroundTask } from './background-agent.js';

// ─── Tool Orchestrator ─────────────────────────────────────────
export { ToolOrchestrator } from './tool-orchestrator.js';

// ─── Safety ────────────────────────────────────────────────────
export {
  type RiskLevel,
  type RiskAssessment,
  type DangerousApprovalChoice,
  type DangerousApprovalRequest,
  type DangerousApprovalHandler,
  SafetyChecker,
  sanitizePath,
  sanitizeUrl,
} from './utils/safety.js';

export {
  ProcessRegistry,
  globalProcessRegistry,
  looksLikeLongLivedCommand,
  type ProcessSession,
  type SpawnBackgroundOptions,
} from './process-registry.js';

// ─── Core Utils ────────────────────────────────────────────────
export { GitUtils } from './utils/git.js';
export { TestRunnerDetector } from './utils/testRunner.js';
export { MCPServersFileManager } from './utils/mcp-servers-file.js';
export {
  collectImageReferencesForPrompt,
  extractAtReferences,
  extractImplicitImagePaths,
  splitAtReferences,
} from './utils/at-references.js';
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
