/* Importing the required modules. */
const express = require("express");
const { createUser, sendOtp, verifyOtp, login, refreshAccessToken, logout } = require("../Controllers/auth");
const protect = require("../Middleware/protect");
const router = express.Router();

// const fetchUser = require("../Middleware/fetchUser.js");




/* The above code is creating a user. */
router.post("/createUser",createUser);
router.post(
  "/send-otp",sendOtp );

router.post(
  "/verify-otp",verifyOtp
);
router.post(
  "/login",login
);
router.post(
  "/logout",protect,logout
);
router.post("/refresh-token", refreshAccessToken);

/* The above code is a login route. */

// router.post(
//   "/login",
//     rateLimiter({ MAX_REQUESTS:5, WINDOW_SIZE:60}),
//   [
//     body("email", "Enter a valid Email").isEmail(),
//     body("password", "Password must of length 8").isLength({ min: 8 }),
//   ],login
// )

/* The above code is changing the password of the user. */
// router.patch("/changePassword", fetchUser,rateLimiter({ MAX_REQUESTS:5, WINDOW_SIZE:60}), [
//     body("oldPassword", "password length should be more than 8").isLength({ min: 8 }),
//     body("newPassword", "password length should be more than 8").isLength({ min: 8 }),
//   ],handleValidation,changePassword);

/* The above code is a route for a user to change his/her password. */
// router.patch("/forgetPassword", rateLimiter({ MAX_REQUESTS:5, WINDOW_SIZE:60}),[
//     body("email", "Please Enter a valid Email").isEmail(),
//     body("username", "Username length must be 8 digits").isLength({ min: 8 }),
//     body("password", "password must be of length 8").isLength({ min: 8 }),
//   ],
//   handleValidation,forgetPassword);
// router.post('/refresh',rateLimiter({ MAX_REQUESTS:30, WINDOW_SIZE:60}),refreshhandler)
// router.post('/logout',fetchUser,rateLimiter({ MAX_REQUESTS:30, WINDOW_SIZE:60}),logout)

// router.get('/imageUpdate',imageUpdate)
// router.post('/recipeUpdate',recipeupdate)

module.exports = router;
