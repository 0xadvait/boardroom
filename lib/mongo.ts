import { MongoClient, type Db } from "mongodb";
import { pseudoEmbedding } from "./scoring";
import type { AgentProfile, RoomState, MongoWrite, ProvenSkill, TeamManagerPreferences } from "./types";

const ROOM_SCOPE = "team-manager-room";
const REGISTRY_SCOPE = "team-manager-agent-registry";
const SETTINGS_SCOPE = "team-manager-settings";

declare global {
  // eslint-disable-next-line no-var
  var __team_manager_mongo_client: Promise<MongoClient> | undefined;
}

export function mongoDbName(): string {
  return process.env.TEAM_MANAGER_DB ?? process.env.BOARDROOM_DB ?? "team_manager";
}

export async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return null;
  }

  if (!globalThis.__team_manager_mongo_client) {
    globalThis.__team_manager_mongo_client = new MongoClient(uri).connect();
  }

  const client = await globalThis.__team_manager_mongo_client;
  return client.db(mongoDbName());
}

export async function closeMongoClient(): Promise<void> {
  if (!globalThis.__team_manager_mongo_client) {
    return;
  }

  const client = await globalThis.__team_manager_mongo_client;
  await client.close();
  globalThis.__team_manager_mongo_client = undefined;
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const existing = await db.listCollections({ name }).toArray();
  return existing.length > 0;
}

export async function ensureCoreCollectionsAndIndexes(): Promise<void> {
  const db = await getMongoDb();
  if (!db) {
    return;
  }

  if (!(await collectionExists(db, "agent_performance_records"))) {
    await db.createCollection("agent_performance_records", {
      timeseries: {
        timeField: "started_at",
        metaField: "agent_id",
        granularity: "seconds"
      }
    });
  }

  const collectionNames = [
    "agent_profiles",
    "tasks",
    "blackboard_entries",
    "memory_cards",
    "groups",
    "audit",
    "source_documents",
    "governance_plans",
    "team_manager_settings"
  ];
  for (const name of collectionNames) {
    if (!(await collectionExists(db, name))) {
      await db.createCollection(name);
    }
  }

  await Promise.all([
    db.collection("agent_profiles").createIndex({ skills: 1 }),
    db.collection("agent_profiles").createIndex({ agent_id: 1 }, { unique: false }),
    db.collection("tasks").createIndex({ group_id: 1, status: 1 }),
    db.collection("blackboard_entries").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection("blackboard_entries").createIndex({ task_id: 1, visibility: 1, entry_type: 1 }),
    db.collection("memory_cards").createIndex({ visibility: 1, owner_agent_id: 1, team_id: 1 }),
    db.collection("source_documents").createIndex({ task_id: 1, source_id: 1 }),
    db.collection("source_documents").createIndex({ fetched_at: -1 }),
    db.collection("governance_plans").createIndex({ plan_id: 1 }),
    db.collection("governance_plans").createIndex({ status: 1, created_at: -1 }),
    db.collection("team_manager_settings").createIndex({ settings_scope: 1 }, { unique: true }),
    db.collection("groups").createIndex({ team_id: 1 }),
    db.collection("audit").createIndex({ task_id: 1 }),
    db.collection("audit").createIndex({ room_run_id: 1 })
  ]);
}

export async function createAtlasVectorSearchIndexes(): Promise<void> {
  const db = await getMongoDb();
  if (!db) {
    throw new Error("MONGODB_URI is not set; cannot create Atlas Vector Search indexes.");
  }

  await ensureCoreCollectionsAndIndexes();

  await db.command({
    createSearchIndexes: "agent_profiles",
    indexes: [
      {
        name: "agent_description_vector_index",
        type: "vectorSearch",
        definition: {
          fields: [
            {
              type: "vector",
              path: "description_embedding",
              numDimensions: 64,
              similarity: "cosine"
            },
            { type: "filter", path: "skills" }
          ]
        }
      }
    ]
  });

  await db.command({
    createSearchIndexes: "blackboard_entries",
    indexes: [
      {
        name: "blackboard_content_vector_index",
        type: "vectorSearch",
        definition: {
          fields: [
            {
              type: "vector",
              path: "content_embedding",
              numDimensions: 64,
              similarity: "cosine"
            },
            { type: "filter", path: "visibility" },
            { type: "filter", path: "task_id" },
            { type: "filter", path: "entry_type" }
          ]
        }
      }
    ]
  });

  await db.command({
    createSearchIndexes: "memory_cards",
    indexes: [
      {
        name: "memory_layered_vector_index",
        type: "vectorSearch",
        definition: {
          fields: [
            {
              type: "vector",
              path: "embedding",
              numDimensions: 64,
              similarity: "cosine"
            },
            { type: "filter", path: "visibility" },
            { type: "filter", path: "owner_agent_id" },
            { type: "filter", path: "team_id" }
          ]
        }
      }
    ]
  });
}

export async function resetMongoRoom(state: RoomState): Promise<{ connected: boolean; error?: string }> {
  try {
    const db = await getMongoDb();
    if (!db) {
      return { connected: false };
    }

    await ensureCoreCollectionsAndIndexes();
    const collections = [
      "agent_profiles",
      "tasks",
      "blackboard_entries",
      "memory_cards",
      "groups",
      "audit",
      "source_documents",
      "governance_plans"
    ];
    await Promise.all(collections.map((name) => db.collection(name).deleteMany({ room_scope: ROOM_SCOPE })));

    state.mongo.mode = "atlas";
    state.mongo.dbName = mongoDbName();
    state.mongo.lastError = undefined;

    return { connected: true };
  } catch (error) {
    state.mongo.mode = "local";
    state.mongo.lastError = error instanceof Error ? error.message : String(error);
    return { connected: false, error: state.mongo.lastError };
  }
}

function agentProfileFromDocument(document: Record<string, unknown>): AgentProfile {
  const agentId = String(document.agent_id ?? document._id);
  const name = String(document.name ?? agentId);
  const role = String(document.role ?? "Registered specialist");
  const description = String(document.description ?? role);
  const skills = Array.isArray(document.skills) ? document.skills.map(String) : [];
  const capabilities = Array.isArray(document.capabilities) ? document.capabilities.map(String) : [];
  const provenSkills = (document.proven_skills ?? {}) as Record<string, ProvenSkill>;
  const avgDurationMs = Number(document.avg_duration_ms ?? 45_000);
  const tokenEfficiency = Number(document.token_efficiency ?? 0.75);
  const lastPerformedAt =
    document.last_performed_at instanceof Date
      ? document.last_performed_at.toISOString()
      : String(document.last_performed_at ?? new Date().toISOString());
  const embedding = Array.isArray(document.description_embedding)
    ? document.description_embedding.map(Number)
    : pseudoEmbedding(`${name} ${role} ${description} ${skills.join(" ")}`);

  return {
    agentId,
    name,
    role,
    description,
    skills,
    capabilities,
    descriptionEmbedding: embedding,
    provenSkills,
    avgDurationMs,
    tokenEfficiency,
    lastPerformedAt,
    status: "candidate",
    selected: false,
    tokensUsed: 0,
    currentStep: "Loaded from MongoDB agent registry"
  };
}

export async function loadRegisteredAgentProfiles(): Promise<AgentProfile[]> {
  const db = await getMongoDb();
  if (!db) {
    return [];
  }

  await ensureCoreCollectionsAndIndexes();
  const documents = await db
    .collection("agent_profiles")
    .find({
      registry_scope: REGISTRY_SCOPE,
      profile_kind: "registered_agent"
    })
    .sort({ updated_at: -1 })
    .limit(100)
    .toArray();

  return documents.map((document) => agentProfileFromDocument(document as Record<string, unknown>));
}

export async function upsertRegisteredAgentProfiles(
  profiles: AgentProfile[],
  options: { replaceRegistry?: boolean } = {}
): Promise<{ connected: boolean; count: number; error?: string }> {
  try {
    const db = await getMongoDb();
    if (!db) {
      return { connected: false, count: 0 };
    }

    await ensureCoreCollectionsAndIndexes();
    const collection = db.collection("agent_profiles");
    if (options.replaceRegistry) {
      await collection.deleteMany({
        registry_scope: REGISTRY_SCOPE,
        profile_kind: "registered_agent"
      });
    }

    for (const profile of profiles) {
      await collection.updateOne(
        {
          registry_scope: REGISTRY_SCOPE,
          profile_kind: "registered_agent",
          agent_id: profile.agentId
        },
        {
          $set: {
            registry_scope: REGISTRY_SCOPE,
            profile_kind: "registered_agent",
            agent_id: profile.agentId,
            name: profile.name,
            role: profile.role,
            description: profile.description,
            skills: profile.skills,
            capabilities: profile.capabilities,
            description_embedding: profile.descriptionEmbedding,
            proven_skills: profile.provenSkills,
            avg_duration_ms: profile.avgDurationMs,
            token_efficiency: profile.tokenEfficiency,
            last_performed_at: new Date(profile.lastPerformedAt),
            updated_at: new Date()
          },
          $setOnInsert: {
            created_at: new Date()
          }
        },
        { upsert: true }
      );
    }

    return { connected: true, count: profiles.length };
  } catch (error) {
    return { connected: false, count: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadTeamManagerPreferences(): Promise<TeamManagerPreferences | null> {
  const db = await getMongoDb();
  if (!db) {
    return null;
  }

  await ensureCoreCollectionsAndIndexes();
  const document = await db.collection("team_manager_settings").findOne({
    settings_scope: SETTINGS_SCOPE
  });
  if (!document?.preferences || typeof document.preferences !== "object") {
    return null;
  }

  return document.preferences as TeamManagerPreferences;
}

export async function upsertTeamManagerPreferences(
  preferences: TeamManagerPreferences
): Promise<{ connected: boolean; error?: string }> {
  try {
    const db = await getMongoDb();
    if (!db) {
      return { connected: false };
    }

    await ensureCoreCollectionsAndIndexes();
    await db.collection("team_manager_settings").updateOne(
      { settings_scope: SETTINGS_SCOPE },
      {
        $set: {
          settings_scope: SETTINGS_SCOPE,
          preferences,
          updated_at: new Date(preferences.updatedAt)
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    return { connected: true };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function decorateDocument(document: Record<string, unknown>, state: RoomState): Record<string, unknown> {
  return {
    room_scope: ROOM_SCOPE,
    room_run_id: state.runId,
    ...document
  };
}

export async function applyMongoWrites(
  state: RoomState,
  writes: MongoWrite[]
): Promise<{ connected: boolean; error?: string }> {
  try {
    const db = await getMongoDb();
    if (!db) {
      state.mongo.mode = "local";
      state.mongo.dbName = mongoDbName();
      return { connected: false };
    }

    await ensureCoreCollectionsAndIndexes();

    for (const write of writes) {
      const collection = db.collection(write.collection);
      if (write.operation === "insertOne" && write.document) {
        await collection.insertOne(decorateDocument(write.document, state));
      }
      if (write.operation === "insertMany" && write.documents?.length) {
        await collection.insertMany(write.documents.map((document) => decorateDocument(document, state)), { ordered: false });
      }
      if (write.operation === "updateOne" && write.filter && write.update) {
        await collection.updateOne(
          decorateDocument(write.filter, state),
          write.update,
          { upsert: false }
        );
      }
    }

    state.mongo.mode = "atlas";
    state.mongo.dbName = mongoDbName();
    state.mongo.lastError = undefined;
    return { connected: true };
  } catch (error) {
    state.mongo.mode = "local";
    state.mongo.dbName = mongoDbName();
    state.mongo.lastError = error instanceof Error ? error.message : String(error);
    return { connected: false, error: state.mongo.lastError };
  }
}
