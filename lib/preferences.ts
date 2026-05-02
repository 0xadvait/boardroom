import type { TeamManagerPreferences } from "./types";

function now(): string {
  return new Date().toISOString();
}

function configuredEnv(...keys: string[]): string | undefined {
  return keys.map((key) => process.env[key]).find((value): value is string => Boolean(value));
}

export function defaultPreferences(updatedAt = now()): TeamManagerPreferences {
  return {
    managerModel: configuredEnv("TEAM_MANAGER_MANAGER_MODEL", "TEAM_MANAGER_LOGIC_MODEL", "BOARDROOM_MANAGER_MODEL") ?? "gpt-5.5",
    logicModel: configuredEnv("TEAM_MANAGER_LOGIC_MODEL", "TEAM_MANAGER_REVIEW_MODEL", "TEAM_MANAGER_SPECIALIST_MODEL") ?? "gpt-5.5",
    logicReasoningEffort: (configuredEnv("TEAM_MANAGER_LOGIC_REASONING_EFFORT", "TEAM_MANAGER_REVIEW_REASONING_EFFORT") ??
      "xhigh") as TeamManagerPreferences["logicReasoningEffort"],
    aestheticModel: configuredEnv("TEAM_MANAGER_AESTHETIC_MODEL", "TEAM_MANAGER_CLAUDE_MODEL", "BOARDROOM_AESTHETIC_MODEL") ?? "claude-opus-4-7",
    summarizerModel: configuredEnv("TEAM_MANAGER_SUMMARIZER_MODEL", "TEAM_MANAGER_LOGIC_MODEL", "BOARDROOM_SUMMARIZER_MODEL") ?? "gpt-5.5",
    sourceProviderPreference: configuredEnv("BRIGHTDATA_API_TOKEN", "BRIGHT_DATA_API_TOKEN", "API_TOKEN") ? "auto" : "host_native",
    optimizationPreference: "balanced",
    defaultMemoryVisibility: "private",
    budgetHardStopAction: "abort",
    defaultMaxAgents: 5,
    allowColdStartTemplates: true,
    requireSourceLinkedClaims: true,
    updatedAt
  };
}

export function mergePreferences(
  base: TeamManagerPreferences,
  patch: Partial<Omit<TeamManagerPreferences, "updatedAt">> = {}
): TeamManagerPreferences {
  return {
    ...base,
    ...patch,
    defaultMaxAgents: Math.min(8, Math.max(1, Math.round(patch.defaultMaxAgents ?? base.defaultMaxAgents))),
    updatedAt: now()
  };
}

function hasEnv(...keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]));
}

function mongoHost(): string | undefined {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return undefined;
  }
  const afterCredentials = uri.includes("@") ? uri.split("@").pop() : uri.replace(/^mongodb(\+srv)?:\/\//, "");
  return afterCredentials?.split(/[/?]/)[0];
}

export function localConfigurationReport(preferences: TeamManagerPreferences) {
  const brightDataConfigured = hasEnv("BRIGHTDATA_API_TOKEN", "BRIGHT_DATA_API_TOKEN", "API_TOKEN");
  const openaiConfigured = hasEnv("OPENAI_API_KEY");
  const anthropicConfigured = hasEnv("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
  const mongodbConfigured = hasEnv("MONGODB_URI");

  return {
    mongodb: {
      configured: mongodbConfigured,
      dbName: process.env.TEAM_MANAGER_DB ?? process.env.BOARDROOM_DB ?? "team_manager",
      host: mongoHost() ?? null
    },
    providers: {
      openai: {
        configured: openaiConfigured,
        defaultLogicModel: preferences.logicModel,
        reasoningEffort: preferences.logicReasoningEffort
      },
      anthropic: {
        configured: anthropicConfigured,
        defaultAestheticModel: preferences.aestheticModel
      },
      brightdata: {
        configured: brightDataConfigured,
        proMode: process.env.BRIGHTDATA_PRO_MODE ?? "true"
      }
    },
    preferences,
    recommendedNextSteps: [
      mongodbConfigured ? "MongoDB is configured for persistent room state." : "Set MONGODB_URI so rooms, memory, checkpoints, and audit persist.",
      openaiConfigured ? "OpenAI is configured for logic-heavy local worker profiles." : "Set OPENAI_API_KEY if this host will run GPT logic workers.",
      anthropicConfigured
        ? "Anthropic is configured for aesthetic/copy/product-polish worker profiles."
        : "Set ANTHROPIC_API_KEY if this host will run Claude aesthetic workers.",
      brightDataConfigured
        ? "Bright Data is configured for search and robust source extraction."
        : "Use host-native search plus team_manager_set_sources, or configure BRIGHTDATA_API_TOKEN."
    ],
    onboardingQuestions: [
      "Should the room optimize for balanced output, speed, cost, or caution?",
      "What models should logic, aesthetic, manager, and summarizer slots use on this machine?",
      "How many specialists should the manager select by default?",
      "Should source-linked claims be required for this type of work?",
      "Should the budget hard stop warn, pause for approval, or abort at 100%?"
    ]
  };
}
