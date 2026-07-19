const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }

    // Visibility into post-boot connection issues — without this, a
    // mid-runtime Atlas blip produces no log signal at all, only
    // downstream request failures with no obvious cause.
    mongoose.connection.on("error", (err) => {
        console.error("MongoDB connection error (post-boot):", err.message);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected. Mongoose will attempt to reconnect automatically.");
    });

    mongoose.connection.on("reconnected", () => {
        console.log("MongoDB reconnected.");
    });
};

module.exports = connectDB;