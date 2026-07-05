#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../server/.env") });

const { MongoClient } = require(path.join(__dirname, "../server/node_modules/mongodb"));

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "airtel_challenge";
  if (!uri) {
    console.error("MONGODB_URI is not set in server/.env");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    const collections = await db.listCollections().toArray();
    console.log("MongoDB OK");
    console.log("Database:", dbName);
    console.log("Collections:", collections.map((c) => c.name).join(", ") || "(none yet)");
    process.exit(0);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  } finally {
    await client.close().catch(function () {});
  }
}

main();
