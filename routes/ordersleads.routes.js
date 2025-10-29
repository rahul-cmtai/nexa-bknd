import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";
import {
  createOrdersLead,
  getOrdersLeads,
  getOrdersLeadById,
  updateOrdersLead,
  deleteOrdersLead,
} from "../controllers/ordersLeads.controller.js";

const router = Router();

// Public: create an orders lead from checkout form
router.post("/", createOrdersLead);

// Admin: manage orders leads
router.get("/", authMiddleware, adminMiddleware, getOrdersLeads);
router.get("/:id", authMiddleware, adminMiddleware, getOrdersLeadById);
router.put("/:id", authMiddleware, adminMiddleware, updateOrdersLead);
router.delete("/:id", authMiddleware, adminMiddleware, deleteOrdersLead);

export default router;
