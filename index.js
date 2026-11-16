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
const joinCollection = db.collection("eventJoins");

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

// Join an event
app.post("/events/:id/join", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body;

    // Validate event ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    // Validate user email
    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    const email = userEmail.trim().toLowerCase();
    const eventId = new ObjectId(id);

    // Check whether event exists
    const event = await eventCollection.findOne({
      _id: eventId,
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    // Check duplicate joining
    const existingJoin = await joinCollection.findOne({
      eventId,
      userEmail: email,
    });

    if (existingJoin) {
      return res.status(409).send({
        message: "You have already joined this event.",
      });
    }

    // Save joining information
    const joinData = {
      eventId,
      userEmail: email,
      joinedAt: new Date(),
    };

    await joinCollection.insertOne(joinData);

    res.status(201).send({
      message: "Successfully joined the event.",
    });
  } catch (error) {
    console.error("Error joining event:", error);

    res.status(500).send({
      message: "Failed to join event",
    });
  }
});

// Get joined events by user email
app.get("/joined-events", async (req, res) => {
  try {
    const userEmail = req.query.email;

    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    const email = userEmail.trim().toLowerCase();

    const joinedEvents = await joinCollection
      .aggregate([
        {
          $match: {
            userEmail: email,
          },
        },
        {
          $lookup: {
            from: "event",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: "$event",
        },
        {
          $sort: {
            "event.eventDate": 1,
          },
        },
        {
          $replaceRoot: {
            newRoot: "$event",
          },
        },
      ])
      .toArray();

    res.status(200).send(joinedEvents);
  } catch (error) {
    console.error("Error fetching joined events:", error);

    res.status(500).send({
      message: "Failed to fetch joined events",
    });
  }
});

// Get events created by a user
app.get("/my-events", async (req, res) => {
  try {
    const email = req.query.email;

    if (!email || typeof email !== "string") {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    const events = await eventCollection
      .find({ createdBy: email.trim().toLowerCase() })
      .sort({ eventDate: 1 })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    console.error("Error fetching user events:", error);
    res.status(500).send({
      message: "Failed to fetch your events",
    });
  }
});

// Update an event
app.put("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, ...updatedData } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    const result = await eventCollection.updateOne(
      {
        _id: new ObjectId(id),
        createdBy: userEmail.trim().toLowerCase(),
      },
      {
        $set: updatedData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not the owner",
      });
    }

    res.status(200).send({
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).send({
      message: "Failed to update event",
    });
  }
});

// Delete an event
app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).send({
        message: "User email is required",
      });
    }

    const result = await eventCollection.deleteOne({
      _id: new ObjectId(id),
      createdBy: email.trim().toLowerCase(),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not the owner",
      });
    }

    res.status(200).send({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).send({
      message: "Failed to delete event",
    });
  }
});

app.get("/", (req, res) => {
  res.send("SebaTori API is running!");
});

app.listen(PORT, () => {
  console.log(`SebaTori server running on port ${PORT}`);
});
