const slugify = require("slugify");
const Course = require("../Modals/Courses");

const generateUniqueSlug = async (
  title,
  excludeCourseId = null
) => {
  const baseSlug = slugify(title, {
    lower: true,
    strict: true,
    trim: true,
  });

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { slug };

    if (excludeCourseId) {
      query._id = { $ne: excludeCourseId };
    }

    const existingCourse =
      await Course.findOne(query);

    if (!existingCourse) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

module.exports = generateUniqueSlug;