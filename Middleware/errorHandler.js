const errorHandler = (err, req, res, next) => {
  console.error("Error caught by errorHandler:", err.message || err);

  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    code: err.code || (statusCode === 403 ? "FORBIDDEN" : statusCode === 404 ? "NOT_FOUND" : "SERVER_ERROR"),
    message: err.message || "An unexpected error occurred.",
    ...(err.details ? { details: err.details } : {}),
  });
};

module.exports = errorHandler;
