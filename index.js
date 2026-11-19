import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

const AUTH_BASE_URL =
  process.env.AUTH_BASE_URL;

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", AUTH_BASE_URL)
);

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  await client.connect();
  console.log("You successfully connected to MongoDB!");
  return client;
}

// JWT verification middleware
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token is required",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      message: "Authentication token is required",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    if (
      typeof payload.email !== "string" ||
      !payload.email.trim()
    ) {
      return res.status(401).json({
        message: "Token does not contain a valid email",
      });
    }

    req.authUser = {
      email: payload.email.trim().toLowerCase(),
      id: payload.sub,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("sebatori");

const eventCollection = db.collection("event");
const joinCollection = db.collection("eventJoins");

// Public: API status
app.get("/", (req, res) => {
  res.send("SebaTori API is running!");
});

// Public: All events
app.get("/events", async (req, res) => {
  try {
    const events = await eventCollection.find({}).toArray();
    res.status(200).json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

// Public: Single event details
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const event = await eventCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch event" });
  }
});

// Public: Upcoming events
app.get("/upcoming-events", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const events = await eventCollection
      .find({ eventDate: { $gt: today } })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    res.status(200).json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch upcoming events",
    });
  }
});

// Protected: Create event
app.post("/add-event", verifyToken, async (req, res) => {
  try {
    const data = {
      ...req.body,
      createdBy: req.authUser.email,
    };

    delete data._id;

    const result = await eventCollection.insertOne(data);

    res.status(201).json({
      message: "Event created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add event" });
  }
});

// Protected: Join event
app.post("/events/:id/join", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const eventId = new ObjectId(id);
    const userEmail = req.authUser.email;

    const event = await eventCollection.findOne({ _id: eventId });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const existingJoin = await joinCollection.findOne({
      eventId,
      userEmail,
    });

    if (existingJoin) {
      return res.status(409).json({
        message: "You have already joined this event.",
      });
    }

    await joinCollection.insertOne({
      eventId,
      userEmail,
      joinedAt: new Date(),
    });

    res.status(201).json({
      message: "Successfully joined the event.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to join event" });
  }
});

// Protected: Get the logged-in user's joined events
app.get("/joined-events", verifyToken, async (req, res) => {
  try {
    const joinedEvents = await joinCollection
      .aggregate([
        { $match: { userEmail: req.authUser.email } },
        {
          $lookup: {
            from: "event",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
        { $sort: { "event.eventDate": 1 } },
        { $replaceRoot: { newRoot: "$event" } },
      ])
      .toArray();

    res.status(200).json(joinedEvents);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch joined events",
    });
  }
});

// Protected: Get the logged-in user's own events
app.get("/my-events", verifyToken, async (req, res) => {
  try {
    const events = await eventCollection
      .find({ createdBy: req.authUser.email })
      .sort({ eventDate: 1 })
      .toArray();

    res.status(200).json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch your events",
    });
  }
});

// Protected: Update an event owned by the logged-in user
app.put("/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const {
      _id,
      createdBy,
      userEmail,
      ...updatedData
    } = req.body;

    const result = await eventCollection.updateOne(
      {
        _id: new ObjectId(id),
        createdBy: req.authUser.email,
      },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Event not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update event" });
  }
});

// Protected: Delete an event owned by the logged-in user
app.delete("/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const result = await eventCollection.deleteOne({
      _id: new ObjectId(id),
      createdBy: req.authUser.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Event not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

app.listen(PORT, () => {
  console.log(`SebaTori server running on port ${PORT}`);
});
