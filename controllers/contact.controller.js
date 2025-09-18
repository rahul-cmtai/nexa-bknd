import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { 
    uploadContactImageOnCloudinary, 
    deleteFromCloudinary,
    getPublicIdFromUrl
} from "../config/cloudinary.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";

import { Contact } from "../models/contact.model.js";
import mongoose from "mongoose";

// @desc    Submit a new contact inquiry (Public)
// @route   POST /api/v1/contact
const submitInquiry = asyncHandler(async (req, res) => {
    let { fullName, name, email, phoneNumber, phone, mobile, message, subject, size } = req.body;

    // Normalize incoming aliases
    fullName = fullName || name;
    phoneNumber = phoneNumber || phone || mobile;

    if ([fullName, email, message].some((field) => !field || field.trim() === "")) {
        throw new ApiError(400, "Full Name, Email, and Message are required.");
    }

    const referenceImageLocalPath = req.file?.path;
    let imageUploadResult = null;
    if (referenceImageLocalPath) {
        imageUploadResult = await uploadOnS3(referenceImageLocalPath, "contacts");
    }

    const newInquiry = await Contact.create({
        fullName,
        email,
        phoneNumber,
        message,
        subject,
        size,
        referenceImage: imageUploadResult?.url || "",
    });

    if (!newInquiry) {
        throw new ApiError(500, "Something went wrong while saving your inquiry.");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, newInquiry, "Inquiry submitted successfully. We will get back to you shortly."));
});

// @desc    Get all inquiries (Admin)
// @route   GET /api/v1/contact/admin
const getAllInquiries = asyncHandler(async (req, res) => {
    const { status } = req.query; // Get status from query params like "?status=New"

    const filter = {}; // Start with an empty filter

    // If a valid status is provided in the query, add it to the filter object
    // This check prevents filtering by arbitrary query params
    if (status && ["New", "Contacted", "Completed", "Rejected"].includes(status)) {
        filter.status = status;
    }

    // Pass the filter object to the find method. If empty, it returns all documents.
    const inquiries = await Contact.find(filter).sort({ createdAt: -1 });
    
    return res
        .status(200)
        .json(new ApiResponse(200, inquiries, "All inquiries fetched successfully."));
});


// @desc    Get a single inquiry by ID (Admin)
// @route   GET /api/v1/contact/admin/:inquiryId
const getInquiryById = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;
    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }
    
    const inquiry = await Contact.findById(inquiryId);
    if (!inquiry) {
        throw new ApiError(404, "Inquiry not found.");
    }

    return res.status(200).json(new ApiResponse(200, inquiry, "Inquiry fetched successfully."));
});

// @desc    Update an inquiry's details (Admin)
// @route   PUT /api/v1/contact/admin/:inquiryId
const updateInquiry = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;
    let { fullName, name, email, phoneNumber, phone, mobile, message, subject, size, status } = req.body;

    // Normalize incoming aliases
    fullName = fullName || name;
    phoneNumber = phoneNumber || phone || mobile;

    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }

    const inquiry = await Contact.findById(inquiryId);
    if (!inquiry) {
        throw new ApiError(404, "Inquiry not found.");
    }

    // Prepare updates
    inquiry.fullName = fullName || inquiry.fullName;
    inquiry.email = email || inquiry.email;
    inquiry.phoneNumber = phoneNumber || inquiry.phoneNumber;
    inquiry.message = message || inquiry.message;
    inquiry.subject = subject || inquiry.subject;
    inquiry.size = size || inquiry.size;
    
    if (status && ["New", "Contacted", "Completed", "Rejected"].includes(status)) {
        inquiry.status = status;
    }

    // Handle new image upload
    const referenceImageLocalPath = req.file?.path;
    if (referenceImageLocalPath) {
        // 1. Purani image S3 se delete karein agar hai to
        if (inquiry.referenceImage) {
            const objectKey = getObjectKeyFromUrl(inquiry.referenceImage);
            if (objectKey) await deleteFromS3(objectKey);
        }

        // 2. Nayi image upload karein
        const imageUploadResult = await uploadOnS3(referenceImageLocalPath, "contacts");
        if (!imageUploadResult) {
            throw new ApiError(500, "Failed to upload new reference image.");
        }
        inquiry.referenceImage = imageUploadResult.url;
    }

    const updatedInquiry = await inquiry.save();

    return res
        .status(200)
        .json(new ApiResponse(200, updatedInquiry, "Inquiry updated successfully."));
});

// @desc    Delete an inquiry (Admin)
// @route   DELETE /api/v1/contact/admin/:inquiryId
const deleteInquiry = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;

    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }
    
    // Find the document first to get the image URL
    const inquiryToDelete = await Contact.findById(inquiryId);

    if (!inquiryToDelete) {
        throw new ApiError(404, "Inquiry not found.");
    }

    // If a reference image exists, delete it from Cloudinary
    if (inquiryToDelete.referenceImage) {
        const objectKey = getObjectKeyFromUrl(inquiryToDelete.referenceImage);
        if (objectKey) {
            await deleteFromS3(objectKey);
        }
    }

    // Now, delete the document from the database
    await Contact.findByIdAndDelete(inquiryId);

    return res.status(200).json(new ApiResponse(200, {}, "Inquiry deleted successfully."));
});

export {
    submitInquiry,
    getAllInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry
};