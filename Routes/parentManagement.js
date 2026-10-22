const express = require('express');
const protect = require('../Middleware/protect');
const authorize = require('../Middleware/authorize');
const controller = require('../Controllers/parent');
const router = express.Router();

// Academy administrators create/revoke parent-child links; parents cannot link themselves.
router.use(protect, authorize('admin'));
router.get('/', controller.listParentLinks);
router.post('/create-parent', controller.createParent);
router.post('/link', controller.linkChild);
router.delete('/:parentId/:studentUserId', controller.unlinkChild);
module.exports = router;
