"use strict";

const { MongoClient } = require("mongodb");

const DB_NAME = process.env.MONGODB_DB_NAME || "airtel_challenge";
let clientPromise = null;

function getUri() {
  return process.env.MONGODB_URI || "";
}

async function getClient() {
  const uri = getUri();
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to server/.env (see .env.example).");
  }
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().then(function () {
      return client;
    });
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  return client.db(DB_NAME);
}

async function ensureIndexes(db) {
  await db.collection("leads").createIndex({ phone: 1 }, { unique: true });
  await db.collection("daily_plays").createIndex({ phone: 1, day: 1 }, { unique: true });
  await db.collection("scores").createIndex({ day: 1, priorityPoints: -1, total: -1, ts: 1 });
  await db.collection("scores").createIndex({ phone: 1, day: 1 });
}

module.exports = { getDb, ensureIndexes, getUri, DB_NAME };
