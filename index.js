
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err;
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("sebatori");
const eventCollection = db.collection("event");

app.post("/add-event", async (req, res) => {
  try {
    const data = req.body;
    const result = await eventCollection.insertOne(data);
    res.send(result);
  } catch (err) {
    console.error("Error adding event:", err);
    res.status(500).send({ message: "Failed to add event" });
  }
});

app.get("/events", async (req, res) => {
  try {
    const events = await eventCollection.find({}).toArray();

    res.status(200).send(events);
  } catch (err) {
    console.error("Error fetching events:", err);

    res.status(500).send({
      message: "Failed to fetch events",
    });
  }
});

app.get("/", (req, res) => {
  res.send("SebaTori API is running!");
});

app.listen(PORT, () => {
  console.log(`SebaTori server running on port ${PORT}`);
});
