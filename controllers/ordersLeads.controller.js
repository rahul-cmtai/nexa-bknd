import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { OrdersLeads } from "../models/ordersLeads.model.js";

export const createOrdersLead = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  let orderRef = undefined;
  if (payload.orderId) {
    if (mongoose.Types.ObjectId.isValid(payload.orderId)) {
      orderRef = payload.orderId;
    }
  }

  const doc = await OrdersLeads.create({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    pincode: payload.pincode,
    deliveryInstructions: payload.deliveryInstructions,
    subscribeNewsletter: Boolean(payload.subscribeNewsletter),
    items: payload.items || [],
    total: Number(payload.total) || 0,
    order: orderRef,
    orderIdRaw: !orderRef ? payload.orderId : undefined,
    source: payload.source || "checkout_form",
    notes: payload.notes,
    createdBy: req.user?._id,
  });

  res.status(201).json(new ApiResponse(201, doc, "Orders lead created"));
});

export const getOrdersLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const docs = await OrdersLeads.find(filter)
    .populate({ path: "order", select: "totalPrice orderStatus createdAt" })
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));

  const total = await OrdersLeads.countDocuments(filter);
  res.status(200).json(new ApiResponse(200, { leads: docs, total }, "Orders leads fetched"));
});

export const getOrdersLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid ID");
  const doc = await OrdersLeads.findById(id).populate({ path: "order", select: "totalPrice orderStatus createdAt" });
  if (!doc) throw new ApiError(404, "Orders lead not found");
  res.status(200).json(new ApiResponse(200, doc, "Orders lead fetched"));
});

export const updateOrdersLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid ID");
  const update = req.body;
  const doc = await OrdersLeads.findByIdAndUpdate(id, update, { new: true });
  if (!doc) throw new ApiError(404, "Orders lead not found");
  res.status(200).json(new ApiResponse(200, doc, "Orders lead updated"));
});

export const deleteOrdersLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid ID");
  const doc = await OrdersLeads.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, "Orders lead not found");
  res.status(200).json(new ApiResponse(200, doc, "Orders lead deleted"));
});


