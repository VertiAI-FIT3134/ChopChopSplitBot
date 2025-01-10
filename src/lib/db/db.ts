import { MongoClient } from "mongodb";
import { env } from "$env/dynamic/private";

const client = new MongoClient(env.MONGO_URI);
const db = client.db("splitgram");

export default db;