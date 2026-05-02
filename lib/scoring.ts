import type { AgentProfile, ScoreBreakdown } from "./types";

const REFERENCE_TIME = Date.parse("2026-05-02T12:00:00+01:00");

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pseudoEmbedding(text: string, dimensions = 64): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const hash = stableHash(token);
    const index = hash % dimensions;
    const weight = 1 + (token.length % 5) / 10;
    vector[index] += weight;

    const neighbor = (index + (hash % 7) + 1) % dimensions;
    vector[neighbor] += weight / 2;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let left = 0;
  let right = 0;

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    left += a[index] * a[index];
    right += b[index] * b[index];
  }

  if (left === 0 || right === 0) {
    return 0;
  }

  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

export function recencyBonus(lastPerformedAt: string): number {
  const performedAt = Date.parse(lastPerformedAt);
  if (Number.isNaN(performedAt)) {
    return 0.3;
  }

  const daysAgo = Math.max(0, (REFERENCE_TIME - performedAt) / (1000 * 60 * 60 * 24));
  return Math.max(0.15, 1 - daysAgo / 30);
}

export function normalizeInverseDuration(avgDurationMs: number): number {
  const expectedFast = 45_000;
  const bounded = Math.max(15_000, avgDurationMs);
  return Math.min(1, expectedFast / bounded);
}

export function classifyTaskType(taskPrompt: string): string {
  const text = taskPrompt.toLowerCase();
  if (/\b(coinbase|exchange|token|crypto|listing|market maker|custody|wallet|blockchain)\b/.test(text)) {
    return "crypto_market_decision";
  }
  if (/\b(api|architecture|technical|integration|database|system|build|migrate|code|infra)\b/.test(text)) {
    return "technical_decision";
  }
  if (/\b(vendor|procurement|buy|renew|supplier|trust center|soc 2|contract)\b/.test(text)) {
    return "procurement_decision";
  }
  if (/\b(market|competitor|pricing|gtm|sales|customer|segment|positioning)\b/.test(text)) {
    return "market_strategy";
  }
  if (/\b(legal|risk|compliance|policy|regulation|privacy|terms|liability)\b/.test(text)) {
    return "legal_risk";
  }
  if (/\b(finance|revenue|cost|roi|budget|funding|runway|unit economics)\b/.test(text)) {
    return "financial_analysis";
  }
  return "general_decision";
}

export function scoreAgents(taskPrompt: string, taskType: string, agents: AgentProfile[]): AgentProfile[] {
  const taskEmbedding = pseudoEmbedding(taskPrompt);
  const withPromptScore = agents
    .map((agent) => {
      const semanticScore = cosineSimilarity(taskEmbedding, agent.descriptionEmbedding);
      const taskTypeBoost = agent.skills.includes(taskType) ? 0.25 : 0;
      const tokenBoost = agent.skills.some((skill) => taskPrompt.toLowerCase().includes(skill.replace(/_/g, " "))) ? 0.1 : 0;
      return {
        agent,
        promptRelevance: Math.min(1, semanticScore + taskTypeBoost + tokenBoost)
      };
    })
    .sort((left, right) => right.promptRelevance - left.promptRelevance)
    .slice(0, 12);

  const scored = withPromptScore
    .map(({ agent, promptRelevance }) => {
      const skill = agent.provenSkills[taskType] ?? agent.provenSkills.general_decision ?? {
        successRate: 0.5,
        avgDurationMs: agent.avgDurationMs,
        avgTokens: 7000,
        runs: 0
      };

      const score: Omit<ScoreBreakdown, "rank"> = {
        promptRelevance,
        historicalSuccess: skill.successRate,
        recencyBonus: recencyBonus(agent.lastPerformedAt),
        timeEfficiency: normalizeInverseDuration(skill.avgDurationMs),
        tokenEfficiency: agent.tokenEfficiency,
        matchScore:
          0.25 * promptRelevance +
          0.35 * skill.successRate +
          0.1 * recencyBonus(agent.lastPerformedAt) +
          0.15 * normalizeInverseDuration(skill.avgDurationMs) +
          0.15 * agent.tokenEfficiency
      };

      return {
        ...agent,
        score: {
          ...score,
          promptRelevance: Number(score.promptRelevance.toFixed(3)),
          historicalSuccess: Number(score.historicalSuccess.toFixed(3)),
          recencyBonus: Number(score.recencyBonus.toFixed(3)),
          timeEfficiency: Number(score.timeEfficiency.toFixed(3)),
          tokenEfficiency: Number(score.tokenEfficiency.toFixed(3)),
          matchScore: Number(score.matchScore.toFixed(3)),
          rank: 0
        }
      };
    })
    .sort((left, right) => (right.score?.matchScore ?? 0) - (left.score?.matchScore ?? 0));

  return scored.map((agent, index) => ({
    ...agent,
    score: agent.score ? { ...agent.score, rank: index + 1 } : undefined
  }));
}

export function buildDispatchAggregation(taskEmbedding: number[], taskType = "general_decision") {
  return [
    {
      $vectorSearch: {
        index: "agent_description_vector_index",
        path: "description_embedding",
        queryVector: taskEmbedding,
        numCandidates: 12,
        limit: 12
      }
    },
    {
      $addFields: {
        prompt_relevance: { $meta: "vectorSearchScore" }
      }
    },
    {
      $lookup: {
        from: "agent_performance_records",
        let: { agent_id: "$agent_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$agent_id", "$$agent_id"] },
              task_type: taskType
            }
          },
          {
            $group: {
              _id: "$agent_id",
              historical_success: {
                $avg: {
                  $cond: [{ $eq: ["$outcome", "success"] }, 1, 0]
                }
              },
              avg_duration_ms: { $avg: "$duration_ms" },
              avg_tokens: { $avg: "$tokens_total" }
            }
          }
        ],
        as: "perf"
      }
    },
    {
      $addFields: {
        perf: { $first: "$perf" },
        historical_success: { $ifNull: [{ $first: "$perf.historical_success" }, 0.5] },
        time_efficiency: {
          $min: [1, { $divide: [45000, { $max: [{ $ifNull: [{ $first: "$perf.avg_duration_ms" }, "$avg_duration_ms"] }, 15000] }] }]
        },
        recency_bonus: 0.9
      }
    },
    {
      $addFields: {
        match_score: {
          $add: [
            { $multiply: [0.25, "$prompt_relevance"] },
            { $multiply: [0.35, "$historical_success"] },
            { $multiply: [0.1, "$recency_bonus"] },
            { $multiply: [0.15, "$time_efficiency"] },
            { $multiply: [0.15, "$token_efficiency"] }
          ]
        }
      }
    },
    { $sort: { match_score: -1 } },
    { $limit: 5 }
  ];
}
