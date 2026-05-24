const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true
        },
        otherName: {
            type: String,
            trim: true,
            default: ""
        },
        surname: {
            type: String,
            required: [true, "Surname is required"],
            trim: true
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"]
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user"
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        otp: {
            type: String,
            default: null
        },
        otpExpires: {
            type: Date,
            default: null
        },
        profilePhoto: {
            type: String,
            default: null
        },
        phone: {
            type: String,
            default: null
        },
        bio: {
            type: String,
            default: null
        },
        hasPaidRegistration: {
            type: Boolean,
            default: false
        },
        registrationPaymentRef: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

userSchema.virtual("fullName").get(function () {
    if (this.otherName) {
        return `${this.firstName} ${this.otherName} ${this.surname}`;
    }
    return `${this.firstName} ${this.surname}`;
});

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);