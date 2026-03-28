/**
 * models/SupplyChainRequest.js
 * ─────────────────────────────
 * Mongoose schema for the SupplyChainRequests collection.
 *
 * Connects to MongoDB Atlas via the DB_URL environment variable.
 *
 * Usage (Node.js / Express / standalone):
 *   const { SupplyChainRequest } = require('./models/SupplyChainRequest');
 *   const doc = await SupplyChainRequest.create({ ... });
 */

"use strict";

const mongoose = require("mongoose");

// ─────────────────────────────────────────────
// DB connection  (reads DB_URL from .env)
// ─────────────────────────────────────────────

require("dotenv").config();

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  throw new Error("DB_URL is not defined in the environment. Aborting.");
}

if (mongoose.connection.readyState === 0) {
  mongoose
    .connect(DB_URL, { dbName: process.env.DB_NAME || "supply_chain_db" })
    .then(() => console.log("✅  MongoDB Atlas connected"))
    .catch((err) => {
      console.error("❌  MongoDB Atlas connection failed:", err.message);
      process.exit(1);
    });
}

// ─────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────

/** B. Single stop in a multi-stop route */
const StopSchema = new mongoose.Schema(
  {
    location: {
      type: String,
      required: [true, "Stop location is required."],
      trim: true,
    },
    order: {
      type: Number,
      required: [true, "Stop order is required."],
      min: [1, "Order must be ≥ 1."],
    },
  },
  { _id: false }   // no separate _id per stop
);

/** E. Warehouse constraints */
const WarehouseConstraintsSchema = new mongoose.Schema(
  {
    preferredLocations: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

/** E. Supplier preferences */
const SupplierPreferencesSchema = new mongoose.Schema(
  {
    preferredSuppliers: { type: [String], default: [] },
    restrictedSuppliers: { type: [String], default: [] },
  },
  { _id: false }
);

/** F. Time window */
const TimeWindowSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: [true, "startTime is required."],
    },
    endTime: {
      type: String,
      required: [true, "endTime is required."],
    },
  },
  { _id: false }
);

/** G. AI Insights — flexible container */
const InsightsSchema = new mongoose.Schema(
  {
    /**
     * `type`  — insight category label
     *   e.g. "risk_summary" | "route_recommendation" | "economic_impact"
     */
    type: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * `data`  — arbitrary JSON payload from the AI engine.
     * Using Mixed for maximum extensibility without schema migrations.
     */
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
// Main schema
// ─────────────────────────────────────────────

const SupplyChainRequestSchema = new mongoose.Schema(
  {
    // ── A. Origin & Destination ─────────────────────────────────────────────
    sourceLocation: {
      type: String,
      required: [true, "sourceLocation is required."],
      trim: true,
    },
    destinationLocation: {
      type: String,
      required: [true, "destinationLocation is required."],
      trim: true,
    },

    // ── B. Multi-stop Distribution ──────────────────────────────────────────
    stops: {
      type: [StopSchema],
      default: [],
    },

    // ── C. Shipment Details ─────────────────────────────────────────────────
    shipmentType: {
      type: String,
      enum: {
        values: ["Raw Materials", "Electronics", "FMCG", "Pharma", "Perishable"],
        message: "'{VALUE}' is not a valid shipment type.",
      },
    },
    quantity: {
      type: String,
      trim: true,
      // e.g. "2400 TEU", "45000 kg"
    },
    transportMode: {
      type: String,
      enum: {
        values: ["Road", "Sea", "Air", "Multi-modal"],
        message: "'{VALUE}' is not a valid transport mode.",
      },
    },

    // ── D. Constraints ──────────────────────────────────────────────────────
    deliveryDeadline: {
      type: Date,
    },
    budget: {
      type: Number,
      min: [0, "Budget must be a non-negative number."],
    },
    priorityLevel: {
      type: String,
      enum: {
        values: ["Low", "Medium", "High"],
        message: "'{VALUE}' is not a valid priority level.",
      },
    },
    riskTolerance: {
      type: String,
      enum: {
        values: ["Low", "Medium", "High"],
        message: "'{VALUE}' is not a valid risk tolerance.",
      },
    },

    // ── E. Distribution & Logistics ─────────────────────────────────────────
    distributionStrategy: {
      type: String,
      enum: {
        values: ["Full", "Partial"],
        message: "'{VALUE}' is not a valid distribution strategy.",
      },
    },
    warehouseConstraints: {
      type: WarehouseConstraintsSchema,
      default: () => ({}),
    },
    supplierPreferences: {
      type: SupplierPreferencesSchema,
      default: () => ({}),
    },

    // ── F. Regulatory & Advanced ────────────────────────────────────────────
    restrictedRegions: {
      type: [String],
      default: [],
    },
    complianceRequirements: {
      type: [String],
      default: [],
      // e.g. ["GDPR", "Hazardous Materials"]
    },
    timeWindows: {
      type: [TimeWindowSchema],
      default: [],
    },

    // ── G. AI Insights ──────────────────────────────────────────────────────
    insights: {
      type: InsightsSchema,
      default: () => ({}),
    },

    // ── H. System Metadata ──────────────────────────────────────────────────
    status: {
      type: String,
      default: "created",
      enum: {
        values: ["created", "processing", "completed", "failed"],
        message: "'{VALUE}' is not a valid status.",
      },
    },
  },
  {
    // Automatically manages createdAt and updatedAt
    timestamps: true,

    // Return plain JS objects by default (no Mongoose wrapper noise)
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },

    // Collection name override
    collection: "SupplyChainRequests",
  }
);

// ─────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────

// Fast lookup by status + creation time
SupplyChainRequestSchema.index({ status: 1, createdAt: -1 });

// Useful for location-based queries
SupplyChainRequestSchema.index({ sourceLocation: 1, destinationLocation: 1 });

// ─────────────────────────────────────────────
// Model export
// ─────────────────────────────────────────────

const SupplyChainRequest = mongoose.model(
  "SupplyChainRequest",
  SupplyChainRequestSchema
);

module.exports = { SupplyChainRequest, SupplyChainRequestSchema };
