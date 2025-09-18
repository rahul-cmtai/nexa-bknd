import { Router } from "express";
import {
  getAdminDashboardStats,
  getRecentAdminOrders,
  getSalesOverview,
  updateOrderStatus,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserOrders,
  getAllAdminOrders,
  getSingleAdminOrder
} from "../controllers/admin.controller.js";
import { getProductById } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
// import { authMiddleware } from "../middlewares/auth.middleware.js";
// import { adminMiddleware } from "../middlewares/admin.middleware.js";

const router = Router();
console.log("Admin router is active.");

// Conditional multer to avoid wiping JSON bodies
const maybeImagesUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return upload.fields([{ name: "images", maxCount: 5 }])(req, res, next);
  }
  return next();
};

// IMPORTANT: Apply security middlewares to protect these routes.
// Uncomment the following line in production to ensure only authenticated admins have access.
// router.use(authMiddleware, adminMiddleware);


// --- Dashboard Routes ---
// URL: GET /api/admin/dashboard
router.route("/dashboard").get(getAdminDashboardStats);

// URL: GET /api/admin/sales-overview
router.route("/sales-overview").get(getSalesOverview);


// --- Product Management Routes ---
// URL: GET /api/admin/products (Get all products)
// URL: POST /api/admin/products (Create a new product)
router
  .route("/products")
  .get(getAllProducts)
  .post(
    maybeImagesUpload,
    createProduct
  );

// URL: GET, PUT, DELETE /api/admin/products/:productId
// (Get, update, or delete a single product by its ID)
router
  .route("/products/:productId")
  .get(getProductById)
  .put(
    maybeImagesUpload,
    updateProduct
  )
  .delete(deleteProduct);


// --- User Management Routes ---
// URL: GET /api/admin/users  <-- **This is the endpoint you need**
router.route("/users").get(getAllUsers);

// URL: GET, PUT, DELETE /api/admin/users/:userId
// (Get, update, or delete a single user by their ID)
router
  .route("/users/:userId")
  .get(getUserById)
  .put(updateUser) // No multer needed here since no files are being uploaded
  .delete(deleteUser);

// URL: GET /api/admin/users/:userId/orders
// (Get all orders for a specific user)
router.route("/users/:userId/orders").get(getUserOrders);


// --- Order Management Routes ---
// URL: GET /api/admin/orders/all
router.route("/orders/all").get(getAllAdminOrders);

// URL: GET /api/admin/orders/recent
router.route("/orders/recent").get(getRecentAdminOrders);

// URL: GET /api/admin/orders/:orderId
router.route("/orders/:orderId").get(getSingleAdminOrder);

// URL: PATCH /api/admin/orders/:orderId/status
router.route("/orders/:orderId/status").patch(updateOrderStatus);


export default router;