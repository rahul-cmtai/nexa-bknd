import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { deleteFromCloudinary, getPublicIdFromUrl, uploadOnCloudinary } from "../config/cloudinary.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";
import mongoose from "mongoose";
import slugify from "slugify";

const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const [totalSalesData, newOrdersCount, activeUsersCount] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "Completed" } },
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments({ orderStatus: { $in: ["Pending", "Processing"] } }),
    User.countDocuments({ role: "user" }),
  ]);
  const stats = {
    totalSales: totalSalesData[0]?.totalSales || 0,
    newOrders: newOrdersCount,
    activeUsers: activeUsersCount,
  };
  return res
    .status(200)
    .json(new ApiResponse(200, stats, "Admin dashboard data fetched"));
});

const getSalesOverview = asyncHandler(async (req, res) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const salesData = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: twelveMonthsAgo },
        orderStatus: "Completed",
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" } },
        sales: { $sum: "$totalPrice" },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthlySales = Array.from({ length: 12 }, (_, i) => ({
    name: monthNames[i],
    sales: 0,
  }));
  salesData.forEach((item) => {
    monthlySales[item._id.month - 1].sales = item.sales;
  });
  return res
    .status(200)
    .json(new ApiResponse(200, monthlySales, "Monthly sales overview fetched"));
});

const getRecentAdminOrders = asyncHandler(async (req, res) => {
  const recentOrders = await Order.find({})
    .populate("user", "fullName")
    .sort({ createdAt: -1 })
    .limit(3)
    .select("user totalPrice orderStatus")
    .lean();
  return res
    .status(200)
    .json(new ApiResponse(200, recentOrders, "Recent admin orders fetched"));
});

//CREATE PRODUCT
const createProduct = asyncHandler(async (req, res) => {
  // --- 1. Destructure Request Body ---
  const {
    name,
    description,
    price,
    salePrice,
    originalPrice,
    stock,
    type,
    category, // Added category field
    gender,
    tags,
    color,
    material,
    adminPackagingWeight,
    adminPackagingDimension,
    dimensions,
    stones,
    jewelleryCategory,
    materialType,
    size,
    // New UX fields
    rating,
    reviews,
    badge,
    features,
    sizes,
    firmness,
    specifications,
  } = req.body;

  // --- 2. Basic Validation ---
  const effectivePrice = price ?? salePrice;
  if (!name || !description || !effectivePrice || !originalPrice || !stock || !type) {
    throw new ApiError(400, "Name, description, price, stock, and type are required fields.");
  }

  // --- 3. Handle Image Uploads (FILES ONLY) ---
  const imageFiles = req.files?.images;
  if (!imageFiles || imageFiles.length === 0) {
    throw new ApiError(400, "At least one product image file is required.");
  }
  const uploadedImages = await Promise.all(imageFiles.map(file => uploadOnS3(file.path, "products")));
  const imageUrls = uploadedImages.map(result => result?.url).filter(Boolean);
  if (imageUrls.length !== imageFiles.length) {
    throw new ApiError(500, "An error occurred while uploading one or more images.");
  }

  // --- 4. Prepare Product Data for Database ---
  const productData = {
    name,
    slug: slugify(name, { lower: true, strict: true }),
    description,
    mainImage: imageUrls[0], // Set first image as main image
    images: imageUrls,
    stock: parseInt(stock, 10),
    originalPrice: parseFloat(originalPrice),
    price: parseFloat(effectivePrice),
    type,
    category: category || undefined, // Added category field
    gender,
    tags: tags ? String(tags).split(',').map(tag => tag.trim()) : [],
    color: color ? String(color).split(',').map(c => c.trim()) : [],
    material,
    adminPackagingWeight: adminPackagingWeight ? parseFloat(adminPackagingWeight) : undefined,
    adminPackagingDimension: {
      length: adminPackagingDimension?.length ? parseFloat(adminPackagingDimension.length) : undefined,
      breadth: adminPackagingDimension?.breadth ? parseFloat(adminPackagingDimension.breadth) : undefined,
      height: adminPackagingDimension?.height ? parseFloat(adminPackagingDimension.height) : undefined,
    },
    // New UX fields (optional)
    rating: rating !== undefined ? parseFloat(rating) : undefined,
    reviews: reviews !== undefined ? parseInt(reviews, 10) : undefined,
    badge,
    features: Array.isArray(features) ? features : (features ? String(features).split(',').map(f => f.trim()) : undefined),
    sizes: Array.isArray(sizes) ? sizes : undefined,
    firmness: Array.isArray(firmness) ? firmness : (firmness ? String(firmness).split(',').map(f => f.trim()) : undefined),
    specifications: specifications || undefined,
  };

  // --- 5. Add Type-Specific Fields Conditionally ---
  if (type === 'jewellery') {
    productData.stones = stones ? String(stones).split(',').map(s => s.trim()) : [];
    productData.dimensions = dimensions;
    productData.jewelleryCategory = jewelleryCategory;
    productData.materialType = materialType;
  } else if (type === 'bag') {
    productData.size = size ? String(size).split(',').map(s => s.trim()) : [];
  } else if (type === 'mattress') {
    // For mattress products, sizes/specifications are already handled above
  }

  // --- 6. Create Product in DB ---
  const product = await Product.create(productData);

  if (!product) {
    throw new ApiError(500, "Something went wrong while creating the product.");
  }

  // --- 7. Send Success Response ---
  return res
    .status(201)
    .json(new ApiResponse(201, product, "Product created successfully."));
});

// UPDATE PRODUCT
const updateProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Invalid product ID format.");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  // --- 1. DESTRUCTURE ALL POSSIBLE FIELDS ---
  const {
    name, 
    description, 
    price, 
    originalPrice, 
    stock, 
    type, 
    category, // Added category field
    gender, 
    tags, 
    color,
    material, 
    adminPackagingWeight, 
    dimensions, 
    stones, 
    jewelleryCategory,
    materialType, 
    size,
    rating,
    reviews,
    badge,
    features,
    sizes,
    firmness,
    specifications,
    // Nested dimension fields
    'adminPackagingDimension[length]': pkgLength,
    'adminPackagingDimension[breadth]': pkgBreadth,
    'adminPackagingDimension[height]': pkgHeight,
  } = req.body;

  const updateData = {};

  // --- 2. BUILD UPDATE OBJECT, CHECKING IF EACH FIELD EXISTS ---
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  const updatedEffectivePrice = price ?? req.body.salePrice;
  if (updatedEffectivePrice !== undefined) updateData.price = parseFloat(updatedEffectivePrice);
  if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
  if (stock !== undefined) updateData.stock = parseInt(stock, 10);
  if (type !== undefined) updateData.type = type;
  if (category !== undefined) updateData.category = category; // Added category update
  if (gender !== undefined) updateData.gender = gender;
  if (tags !== undefined) updateData.tags = String(tags).split(',').map(t => t.trim());
  if (color !== undefined) updateData.color = String(color).split(',').map(c => c.trim());
  if (material !== undefined) updateData.material = material;
  if (adminPackagingWeight !== undefined) updateData.adminPackagingWeight = parseFloat(adminPackagingWeight);

  // UX fields updates
  if (rating !== undefined) updateData.rating = parseFloat(rating);
  if (reviews !== undefined) updateData.reviews = parseInt(reviews, 10);
  if (badge !== undefined) updateData.badge = badge;
  if (features !== undefined) updateData.features = Array.isArray(features) ? features : String(features).split(',').map(f => f.trim());
  if (sizes !== undefined) updateData.sizes = Array.isArray(sizes) ? sizes : undefined;
  if (firmness !== undefined) updateData.firmness = Array.isArray(firmness) ? firmness : String(firmness).split(',').map(f => f.trim());
  if (specifications !== undefined) updateData.specifications = specifications;

  // --- 3. RECONSTRUCT THE NESTED OBJECT ---
  if (pkgLength !== undefined || pkgBreadth !== undefined || pkgHeight !== undefined) {
    updateData.adminPackagingDimension = {
      length: pkgLength !== undefined ? parseFloat(pkgLength) : product.adminPackagingDimension?.length,
      breadth: pkgBreadth !== undefined ? parseFloat(pkgBreadth) : product.adminPackagingDimension?.breadth,
      height: pkgHeight !== undefined ? parseFloat(pkgHeight) : product.adminPackagingDimension?.height,
    };
  }

  // Type-specific field updates
  if (type === 'jewellery') {
    if (dimensions !== undefined) updateData.dimensions = dimensions;
    if (stones !== undefined) updateData.stones = String(stones).split(',').map(s => s.trim());
    if (jewelleryCategory !== undefined) updateData.jewelleryCategory = jewelleryCategory;
    if (materialType !== undefined) updateData.materialType = materialType;
  } else if (type === 'bag') {
    if (size !== undefined) updateData.size = String(size).split(',').map(s => s.trim());
  }

  // --- Images update (FILES ONLY) ---
  const imageFiles = req.files?.images;
  if (imageFiles && imageFiles.length > 0) {
    const uploadedImages = await Promise.all(imageFiles.map(file => uploadOnS3(file.path, "products")));
    const newImageUrls = uploadedImages.map(result => result?.url).filter(Boolean);
    if (newImageUrls.length > 0) {
      // Delete old images from S3
      if (product.images && product.images.length > 0) {
        await Promise.all(product.images.map(getObjectKeyFromUrl).map(key => deleteFromS3(key)));
      }
      updateData.images = newImageUrls;
      updateData.mainImage = newImageUrls[0]; // Update main image
    }
  }

  // --- 4. EXECUTE THE UPDATE ---
  const updatedProduct = await Product.findByIdAndUpdate(
    productId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedProduct, "Product updated successfully."));
});

// DELETE PRODUCT
const deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new ApiError(400, "Invalid product ID format.");
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      throw new ApiError(404, "Product not found.");
    }
    
    const assetsToDelete = [];
    if (product.images && product.images.length > 0) {
      product.images.forEach(url => assetsToDelete.push(getObjectKeyFromUrl(url)));
    }
    
    const s3DeletionPromises = assetsToDelete.map(key => deleteFromS3(key));
    const dbDeletionPromise = Product.findByIdAndDelete(productId);
      
    await Promise.all([
      ...s3DeletionPromises,
      dbDeletionPromise
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Product deleted successfully."));
  } catch(error) {
    console.log(error);
    throw new ApiError(500, "Something went wrong while deleting the product.");
  }
});

// GET ALL PRODUCTS
const getAllProducts = asyncHandler(async (req, res) => {
  // --- 1. DESTRUCTURE QUERY PARAMS ---
  const {
    page = 1,
    limit = 10,
    search,
    type,
    category, // Added category filter
    gender,
    tags,
    color,
    material,
    stones,
    materialType,
    jewelleryCategory,
  } = req.query;

  // --- 2. BUILD THE DATABASE QUERY OBJECT DYNAMICALLY ---
  const query = {};

  // Part A: Broad multi-field search
  if (search) {
    const searchRegex = { $regex: search, $options: "i" };
    query.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { type: searchRegex },
      { category: searchRegex }, // Added category to search
      { gender: searchRegex },
      { material: searchRegex },
      { materialType: searchRegex },
      { stones: searchRegex },
      { color: searchRegex },
      { tags: searchRegex },
    ];
  }

  // Part B: Specific narrowing filters (implicitly AND'ed)
  if (type) query.type = type;
  if (category) query.category = category; // Added category filter
  if (material) query.material = material;
  if (materialType) query.materialType = materialType;
  
  // Correctly handle comma-separated values
  if (gender) {
    query.gender = { $in: gender.split(',').map(g => g.trim()) };
  }
  
  // Use $all for tags to enforce an AND condition
  if (tags) {
    query.tags = { $all: tags.split(',').map(tag => tag.trim()) };
  }
  
  // These are correct for OR conditions
  if (jewelleryCategory) {
    query.jewelleryCategory = { $in: jewelleryCategory.split(',').map(c => c.trim()) };
  }
  if (color) {
    query.color = { $in: color.split(',').map(c => c.trim()) };
  }
  if (stones) {
    query.stones = { $in: stones.split(',').map(s => s.trim()) };
  }

  // --- 3. SETUP PAGINATION OPTIONS ---
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  // --- 4. EXECUTE QUERY ---
  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber);

  const totalProducts = await Product.countDocuments(query);
  
  if (products.length === 0 && totalProducts > 0) {
      throw new ApiError(404, "No products found on this page for the given criteria.");
  }

  // --- 5. SEND THE PAGINATED RESPONSE ---
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalProducts / limitNumber),
        totalProducts,
      },
      "Products fetched successfully"
    )
  );
});

// GET ALL USERS 
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, name } = req.query;
  
  // Use 'search' if provided, otherwise fallback to 'name'
  const searchQuery = search || name;

  const query = {};

  // Add search functionality for fullName or email
  if (searchQuery) {
    const searchRegex = { $regex: searchQuery, $options: "i" };
    query.$or = [
      { fullName: searchRegex }, 
      { email: searchRegex }
    ];
  }

  // Pagination logic
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  // Database query using the constructed query object
  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber)
    .select("-password -otp -refreshToken -forgotPasswordToken");

  // Get the total count of documents that match the query for pagination
  const totalUsers = await User.countDocuments(query);

  // Send the structured response
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalUsers / limitNumber),
        totalUsers,
      },
      "Users fetched successfully"
    )
  );
});

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId).select("-password -otp -refreshToken");
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(new ApiResponse(200, user, "User details fetched successfully"));
});

const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // Destructure ALL possible fields from the request body
  const { fullName, email, role, gender, status } = req.body; 
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID format.");
    }

    // Find the user first to compare the email
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }
    
    // Build the update object dynamically
    const updateData = {};

    if (fullName) updateData.fullName = fullName;
    
    // Add validation to ensure the role and gender match the schema's enum values
    if (role && ['user', 'admin'].includes(role)) {
      updateData.role = role;
    }
    if (gender && ['Male', 'Female', 'Other'].includes(gender)) {
      updateData.gender = gender;
    }
    if (status && ['Active', 'Blocked'].includes(status)) {
      updateData.status = status;
    }

    // Handle email updates carefully to ensure uniqueness
    if (email && email !== user.email) {
      const existingUserWithEmail = await User.findOne({ email });
      if (existingUserWithEmail) {
        throw new ApiError(400, "This email address is already in use by another account.");
      }
      updateData.email = email;
    }

    // Perform the update if there's anything to update
    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, "No valid fields provided for update.");
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -otp -refreshToken -forgotPasswordToken");

    if (!updatedUser) {
      throw new ApiError(500, "Something went wrong while updating the user.");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "User updated successfully"));
  } catch(error) {
    console.log(error);
    throw new ApiError(500, "Something went wrong while updating the user.");
  }
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findByIdAndDelete(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(new ApiResponse(200, {}, "User deleted successfully"));
});

//GET USER ORDERS
const getUserOrders = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }
  const orders = await Order.find({ user: userId }).populate(
    "orderItems.product",
    "name price"
  );
  return res
    .status(200)
    .json(new ApiResponse(200, orders, `Orders for user fetched successfully`));
});

const getAllAdminOrders = asyncHandler(async (req, res) => {
  // PAGINATION LOGIC
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Get total count of orders for pagination info
  const totalOrders = await Order.countDocuments();

  const orders = await Order.find({})
    .populate("user", "fullName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return res
    .status(200)
    .json(new ApiResponse(200, {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
    }, "All orders fetched"));
});

const getSingleAdminOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  // Validate the Order ID format
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ApiError(400, "Invalid Order ID format.");
  }
  
  // Find the order by its ID
  const order = await Order.findById(orderId)
      .populate("user", "fullName email")
      .populate("orderItems.product", "name images price");

  // If no order is found, throw a 404 error
  if (!order) {
      throw new ApiError(404, "Order not found.");
  }

  // Send a successful response with the order data
  res.status(200).json(new ApiResponse(200, order, "Order details fetched successfully for admin."));
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, "Invalid Order ID");
  }
  const validStatuses = [
    "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
  ];
  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`
    );
  }
  const order = await Order.findByIdAndUpdate(
    orderId,
    { $set: { orderStatus: status } },
    { new: true }
  ).populate("user", "name");
  if (!order) {
    throw new ApiError(404, "Order not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order status updated successfully"));
});

export {
  getAdminDashboardStats,
  getSalesOverview,
  getRecentAdminOrders,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getAllUsers,
  getSingleAdminOrder,
  getUserById,
  updateUser,
  deleteUser,
  getUserOrders,
  updateOrderStatus,
  getAllAdminOrders,
};
