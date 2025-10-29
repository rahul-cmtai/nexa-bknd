import mongoose from "mongoose";

const ordersLeadItemSchema = new mongoose.Schema(
  {
    productId: { type: String },
    productName: { type: String },
    size: { type: String },
    firmness: { type: String },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const ordersLeadsSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    deliveryInstructions: { type: String },
    subscribeNewsletter: { type: Boolean, default: false },
    items: { type: [ordersLeadItemSchema], default: [] },
    total: { type: Number, default: 0 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderIdRaw: { type: String },
    status: {
      type: String,
      enum: ["New", "Contacted", "Qualified", "Converted", "Rejected"],
      default: "New",
    },
    source: { type: String, default: "checkout_form" },
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const OrdersLeads = mongoose.model("OrdersLeads", ordersLeadsSchema);


