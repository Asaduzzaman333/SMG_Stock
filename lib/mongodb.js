import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "smg_stock";

let clientPromise = globalThis.__smgMongoClientPromise;

if (!clientPromise && uri) {
  const client = new MongoClient(uri);
  clientPromise = client.connect();
  globalThis.__smgMongoClientPromise = clientPromise;
}

export async function getDb() {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  const client = await clientPromise;
  return client.db(dbName);
}

export async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}
