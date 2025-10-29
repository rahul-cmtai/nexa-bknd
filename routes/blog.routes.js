import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";
import { createBlog, updateBlog, deleteBlog, getBlogs, getBlogBySlug } from "../controllers/blog.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// Public
router.get("/", getBlogs);
router.get("/:slug", getBlogBySlug);

// Admin only
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "gallery", maxCount: 12 },
  ]),
  createBlog
);
router.put(
  "/:idOrSlug",
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "gallery", maxCount: 12 },
  ]),
  updateBlog
);
router.delete("/:idOrSlug", authMiddleware, adminMiddleware, deleteBlog);

export default router;



