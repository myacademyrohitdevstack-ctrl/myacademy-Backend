const errorHandler = (err, req, res, next) => {
  console.error("Error caught by errorHandler:", err.message || err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "An unexpected error occurred.";
  let code = err.code;

  if (err.name === "CastError") {
    statusCode = 404;
    code = "NOT_FOUND";
    message = "Resource not found or invalid identifier.";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(", ") || "Validation failed.";
  }

  return res.status(statusCode).json({
    success: false,
    code: code || (statusCode === 403 ? "FORBIDDEN" : statusCode === 404 ? "NOT_FOUND" : "SERVER_ERROR"),
    message: message,
    ...(err.details ? { details: err.details } : {}),
  });
};

module.exports = errorHandler;
