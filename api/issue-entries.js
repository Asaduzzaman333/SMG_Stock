import { ObjectId } from "mongodb";
import { getCollection } from "../lib/mongodb.js";
import { requireSession } from "../lib/auth.js";

const collectionName = "issueEntries";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serialize(doc) {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

function objectId(id) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid entry id.");
  }

  return new ObjectId(id);
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) {
    return;
  }

  try {
    const collection = await getCollection(collectionName);

    if (req.method === "GET") {
      const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
      res.status(200).json(docs.map(serialize));
      return;
    }

    if (req.method === "POST") {
      const entry = await readBody(req);
      const now = new Date();
      const result = await collection.insertOne({ ...entry, createdAt: now, updatedAt: now });
      res.status(201).json({ id: result.insertedId.toString() });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...entry } = await readBody(req);
      const now = new Date();
      await collection.updateOne({ _id: objectId(id) }, { $set: { ...entry, updatedAt: now } });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      await collection.deleteOne({ _id: objectId(id) });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET,POST,PUT,DELETE");
    res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    res.status(500).json({ error: error.message || "Issue entry request failed." });
  }
}
