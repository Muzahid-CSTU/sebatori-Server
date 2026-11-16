import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

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


app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const event = await eventCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    res.status(200).send(event);
  } catch (err) {
    console.error("Error fetching event:", err);

    res.status(500).send({
      message: "Failed to fetch event",
    });
  }
});

app.get("/upcoming-events", async (req, res) => {
  try {
    const events = await eventCollection
      .find({
        eventDate: { $gt: new Date().toISOString().slice(0, 10) },
      })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    res.status(200).send(events);
  } catch (err) {
    console.error("Error fetching upcoming events:", err);

    res.status(500).send({
      message: "Failed to fetch upcoming events",
    });
  }
});

app.get("/", (req, res) => {
  res.send("SebaTori API is running!");
});

app.listen(PORT, () => {
  console.log(`SebaTori server running on port ${PORT}`);
});
