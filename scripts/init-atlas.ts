import { closeMongoClient, createAtlasVectorSearchIndexes, ensureCoreCollectionsAndIndexes, getMongoDb, mongoDbName } from "../lib/mongo";

async function main() {
  const db = await getMongoDb();
  if (!db) {
    throw new Error("MONGODB_URI is not set. Export it before running npm run atlas:init.");
  }

  await ensureCoreCollectionsAndIndexes();
  console.log(`Created core collections and standard indexes in ${mongoDbName()}.`);

  try {
    await createAtlasVectorSearchIndexes();
    console.log("Requested Atlas Vector Search indexes:");
    console.log("  - agent_profiles.agent_description_vector_index");
    console.log("  - blackboard_entries.blackboard_content_vector_index");
    console.log("  - memory_cards.memory_layered_vector_index");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists") || message.includes("IndexAlreadyExists")) {
      console.log("Vector indexes already exist.");
      return;
    }
    throw error;
  }
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    await closeMongoClient();
    console.error(error);
    process.exit(1);
  });
