const express = require("express");
const WebSocket = require("ws");
const cron = require("node-cron");
const fs = require("fs");
const app = express();

const PORT = 3005;
const WS_PORT = 8090;

app.use(express.json());

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });
wss.on("connection", (ws) => {
    console.log("Client connected");
    ws.send("Connected to WebSocket server");
});

// Events Array
let events = [];

// POST /events - Add Event
app.post("/events", (req, res) => {
    const { title, description, time } = req.body;

    // Validation
    if (!title || !description || !time || new Date(time) <= new Date()) {
        return res.status(400).json({ message: "Invalid input or time in the past." });
    }

    // Check for overlapping events
    const overlaps = events.filter(
        (event) => new Date(event.time).getTime() === new Date(time).getTime()
    );

    const newEvent = {
        title,
        description,
        time,
        notified: false,
        overlaps: overlaps.length > 0,
    };

    events.push(newEvent);
    res.status(201).json({ message: "Event created successfully", event: newEvent });
});

// GET /events - Get All Upcoming Events
app.get("/events", (req, res) => {
    const upcomingEvents = events.filter((event) => new Date(event.time) > new Date());
    res.status(200).json(upcomingEvents);
});

// Cron Job - Notify 5 Minutes Before Event
cron.schedule("* * * * *", () => {
    const now = new Date();

    events.forEach((event, index) => {
        const eventTime = new Date(event.time);
        const timeDiff = (eventTime - now) / 1000 / 60;

        // Notify 5 minutes before
        if (timeDiff <= 5 && timeDiff > 0 && !event.notified) {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(
                        `Event "${event.title}" is about to start in 5 minutes. ${
                            event.overlaps ? "This event overlaps with another event." : ""
                        }`
                    );
                }
            });
            event.notified = true;
        }

        // Log completed events
        if (timeDiff <= 0) {
            const completedEvent = events.splice(index, 1)[0];
            const logEntry = {
                timestamp: new Date().toISOString(),
                title: completedEvent.title,
                description: completedEvent.description,
            };

            fs.readFile("events.json", (err, data) => {
                if (err && err.code !== "ENOENT") {
                    console.error("Error reading events.json:", err);
                    return;
                }

                let logs = [];
                if (data) {
                    try {
                        logs = JSON.parse(data);
                    } catch (e) {
                        console.error("Error parsing events.json:", e);
                    }
                }

                logs.push(logEntry);

                fs.writeFile("events.json", JSON.stringify(logs, null, 2), (err) => {
                    if (err) {
                        console.error("Error writing to events.json:", err);
                    } else {
                        console.log("Event logged to events.json");
                    }
                });
            });
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
});