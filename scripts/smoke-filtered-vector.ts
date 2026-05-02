import { closeMongoClient, getMongoDb, mongoDbName } from "../lib/mongo";
import { pseudoEmbedding } from "../lib/scoring";

async function main() {
  const db = await getMongoDb();
  if (!db) {
    throw new Error("MONGODB_URI is not set. Export it before running npm run atlas:smoke.");
  }

  const collection = db.collection("memory_cards");
  const teamId = "smoke-team";
  const ownerAgentId = "agent-security";

  await collection.deleteMany({ demo_scope: "vector-smoke" });
  await collection.insertMany([
    {
      demo_scope: "vector-smoke",
      content: "Private SOC 2 scope concern for SecurityReview only.",
      visibility: "private",
      owner_agent_id: ownerAgentId,
      team_id: teamId,
      embedding: pseudoEmbedding("SOC 2 report scope security private"),
      reuse_count: 1,
      created_at: new Date()
    },
    {
      demo_scope: "vector-smoke",
      content: "Team-visible pricing guardrail: configure billing limits.",
      visibility: "team",
      owner_agent_id: "agent-pricing",
      team_id: teamId,
      embedding: pseudoEmbedding("pricing billing limit guardrail team"),
      reuse_count: 3,
      created_at: new Date()
    },
    {
      demo_scope: "vector-smoke",
      content: "Global vendor checklist for analytics procurement.",
      visibility: "global",
      owner_agent_id: "agent-procurement",
      team_id: "global",
      embedding: pseudoEmbedding("vendor analytics procurement checklist global"),
      reuse_count: 8,
      created_at: new Date()
    },
    {
      demo_scope: "vector-smoke",
      content: "Other team private note that should not leak.",
      visibility: "private",
      owner_agent_id: "agent-finance",
      team_id: "other-team",
      embedding: pseudoEmbedding("private finance note hidden"),
      reuse_count: 1,
      created_at: new Date()
    },
    {
      demo_scope: "vector-smoke",
      content: "Other team's billing note that should be excluded by team filter.",
      visibility: "team",
      owner_agent_id: "agent-pricing",
      team_id: "other-team",
      embedding: pseudoEmbedding("pricing billing limit other team"),
      reuse_count: 1,
      created_at: new Date()
    }
  ]);

  const queryVector = pseudoEmbedding("SOC 2 pricing procurement guardrails");
  const pipeline = [
    {
      $vectorSearch: {
        index: "memory_layered_vector_index",
        path: "embedding",
        queryVector,
        numCandidates: 20,
        limit: 5,
        filter: {
          $or: [
            { visibility: "global" },
            { visibility: "team", team_id: teamId },
            { visibility: "private", owner_agent_id: ownerAgentId }
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        content: 1,
        visibility: 1,
        owner_agent_id: 1,
        team_id: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ];

  type SmokeResult = {
    content?: string;
    visibility?: string;
    owner_agent_id?: string;
    team_id?: string;
    score?: number;
  };
  let results: SmokeResult[] = [];
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    results = await collection.aggregate(pipeline).toArray();
    if (results.length > 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log(`Filtered vector search results from ${mongoDbName()}:`);
  console.table(results);

  if (results.length === 0) {
    throw new Error("Filtered vector search returned no results. The Atlas index may still be building.");
  }

  const leaked = results.some((result) => result.team_id === "other-team");
  if (leaked) {
    throw new Error("Filtered vector search leaked an unauthorized memory card.");
  }

  console.log("Smoke test passed: private/team/global visibility filter held.");
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    await closeMongoClient();
    console.error(error);
    process.exit(1);
  });
