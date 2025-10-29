import mongoose, { Schema, model } from "mongoose";

const AuthorSchema = new Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    bio: { type: String },
  },
  { _id: false }
);

const SEOSchema = new Schema(
  {
    title: { type: String },
    description: { type: String },
    keywords: [{ type: String }],
    ogImage: { type: String },
  },
  { _id: false }
);

const MediaSchema = new Schema(
  {
    url: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw", "auto"], default: "image" },
  },
  { _id: false }
);

const BlogSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    coverImage: { type: MediaSchema },
    gallery: [MediaSchema],
    author: { type: AuthorSchema, required: true },
    tags: [{ type: String, index: true }],
    readTime: { type: String, default: "5 min read" },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    seo: { type: SEOSchema },
    publishedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

BlogSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

export const Blog = mongoose.models.Blog || model("Blog", BlogSchema);


