const express = require("express");
const router = express.Router();
const { getCourses, getCourse, getCategories } = require("../controllers/course.controller");

// @route   GET /api/courses
// @desc    Get all active courses
// @access  Public
router.get("/", getCourses);

// @route   GET /api/courses/categories
// @desc    Get all active categories
// @access  Public
router.get("/categories", getCategories);

// @route   GET /api/courses/:id
// @desc    Get single course
// @access  Public
router.get("/:id", getCourse);

module.exports = router;