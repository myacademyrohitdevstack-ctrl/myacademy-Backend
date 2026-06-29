const slugify = require("slugify");
const Academy = require("../Modals/Academy");

const generateUniqueAcademySlug = async (
  academyName,
  excludeAcademyId = null
) => {
  const baseSlug = slugify(academyName, {
    lower: true,
    strict: true,
    trim: true,
  });

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { slug };

    if (excludeAcademyId) {
      query._id = { $ne: excludeAcademyId };
    }

    const existingAcademy = await Academy.findOne(query);

    if (!existingAcademy) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

module.exports = generateUniqueAcademySlug;