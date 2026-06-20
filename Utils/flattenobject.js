const flatten=(obj, prefix = "")=> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      Object.assign(acc, flatten(value, path));
    } else {
      acc[path] = value;
    }

    return acc;
  }, {});
}
module.exports =flatten