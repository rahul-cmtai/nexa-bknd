import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Blog } from "../models/blog.model.js";
import slugify from "slugify";
import { uploadOnCloudinary } from "../config/cloudinary.js";

// CREATE BLOG (Admin)
const createBlog = asyncHandler(async (req, res) => {
  let {
    slug,
    title,
    excerpt,
    content,
    author,
    tags,
    readTime,
    status,
    seo,
    publishedAt,
  } = req.body;

  // Parse JSON-like fields if they arrive as strings in multipart forms
  if (typeof author === "string") {
    try { author = JSON.parse(author); } catch { /* ignore, validation will catch */ }
  }
  if (typeof seo === "string") {
    try { seo = JSON.parse(seo); } catch { /* ignore */ }
  }

  if (!title || !excerpt || !content || !author) {
    throw new ApiError(400, "title, excerpt, content, author are required");
  }

  const finalSlug = slug?.trim() || slugify(title, { lower: true, strict: true });
  const existing = await Blog.findOne({ slug: finalSlug });
  if (existing) throw new ApiError(409, "Slug already exists");

  // Handle uploaded files (coverImage: single, gallery: many). Multer stores at req.files
  const coverFile = req.files?.coverImage?.[0];
  const galleryFiles = req.files?.gallery || [];

  let coverImageObj = undefined;
  if (coverFile?.path) {
    const uploaded = await uploadOnCloudinary(coverFile.path);
    if (uploaded) {
      coverImageObj = {
        url: uploaded.secure_url || uploaded.url,
        resourceType: uploaded.resource_type || "auto",
      };
    }
  }

  const galleryObjs = [];
  for (const gf of galleryFiles) {
    if (gf?.path) {
      const up = await uploadOnCloudinary(gf.path);
      if (up?.secure_url || up?.url) {
        galleryObjs.push({
          url: up.secure_url || up.url,
          resourceType: up.resource_type || "auto",
        });
      }
    }
  }

  const doc = await Blog.create({
    slug: finalSlug,
    title,
    excerpt,
    content,
    coverImage: coverImageObj,
    gallery: galleryObjs,
    author,
    tags: Array.isArray(tags) ? tags : tags ? String(tags).split(",").map(t => t.trim()) : [],
    readTime: readTime || undefined,
    status: status || undefined,
    seo: seo || undefined,
    publishedAt: publishedAt ? new Date(publishedAt) : undefined,
  });

  return res.status(201).json(new ApiResponse(201, doc, "Blog created"));
});

// UPDATE BLOG (Admin)
const updateBlog = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const blog = await Blog.findOne({ $or: [{ _id: idOrSlug }, { slug: idOrSlug }] });
  if (!blog) throw new ApiError(404, "Blog not found");

  const update = {};
  let {
    slug,
    title,
    excerpt,
    content,
    author,
    category,
    tags,
    readTime,
    status,
    seo,
    publishedAt,
  } = req.body;

  if (typeof author === "string") {
    try { author = JSON.parse(author); } catch { /* ignore */ }
  }
  if (typeof seo === "string") {
    try { seo = JSON.parse(seo); } catch { /* ignore */ }
  }

  if (slug) update.slug = slugify(slug, { lower: true, strict: true });
  if (title !== undefined) update.title = title;
  if (excerpt !== undefined) update.excerpt = excerpt;
  if (content !== undefined) update.content = content;
  // Handle newly uploaded files if provided
  const coverFile = req.files?.coverImage?.[0];
  const galleryFiles = req.files?.gallery || [];
  if (coverFile?.path) {
    const uploaded = await uploadOnCloudinary(coverFile.path);
    if (uploaded?.secure_url || uploaded?.url) {
      update.coverImage = {
        url: uploaded.secure_url || uploaded.url,
        resourceType: uploaded.resource_type || "auto",
      };
    }
  }
  if (galleryFiles.length > 0) {
    const media = [];
    for (const gf of galleryFiles) {
      if (gf?.path) {
        const up = await uploadOnCloudinary(gf.path);
        if (up?.secure_url || up?.url) {
          media.push({
            url: up.secure_url || up.url,
            resourceType: up.resource_type || "auto",
          });
        }
      }
    }
    update.gallery = media;
  }
  if (author !== undefined) update.author = author;
  if (tags !== undefined)
    update.tags = Array.isArray(tags) ? tags : String(tags).split(",").map(t => t.trim());
  if (readTime !== undefined) update.readTime = readTime;
  if (status !== undefined) update.status = status;
  if (seo !== undefined) update.seo = seo;
  if (publishedAt !== undefined) update.publishedAt = publishedAt ? new Date(publishedAt) : undefined;

  const updated = await Blog.findByIdAndUpdate(blog._id, { $set: update }, { new: true, runValidators: true });
  return res.status(200).json(new ApiResponse(200, updated, "Blog updated"));
});

// DELETE BLOG (Admin)
const deleteBlog = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const blog = await Blog.findOne({ $or: [{ _id: idOrSlug }, { slug: idOrSlug }] });
  if (!blog) throw new ApiError(404, "Blog not found");
  await Blog.findByIdAndDelete(blog._id);
  return res.status(200).json(new ApiResponse(200, {}, "Blog deleted"));
});

// LIST BLOGS (Public)
const getBlogs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 12,
    tag,
    status = undefined,
    search,
  } = req.query;

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(pageSize, 10);
  const skip = (pageNumber - 1) * limitNumber;

  const query = {};
  if (status) query.status = status;
  if (tag) query.tags = { $in: [tag] };
  if (search) {
    const rx = { $regex: search, $options: "i" };
    query.$or = [{ title: rx }, { excerpt: rx }, { content: rx }, { tags: rx }];
  }

  const [items, total] = await Promise.all([
    Blog.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .select("slug title excerpt coverImage author tags readTime publishedAt createdAt updatedAt"),
    Blog.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      data: items,
      pagination: {
        page: pageNumber,
        pageSize: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    }, "Blogs fetched")
  );
});

// DETAIL BY SLUG (Public)
const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const doc = await Blog.findOne({ slug });
  if (!doc) throw new ApiError(404, "Blog not found");
  return res.status(200).json(new ApiResponse(200, { data: doc }, "Blog fetched"));
});

export { createBlog, updateBlog, deleteBlog, getBlogs, getBlogBySlug };


