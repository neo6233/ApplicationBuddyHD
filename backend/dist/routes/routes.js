"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controllers_1 = require("../controllers/controllers");
const router = (0, express_1.Router)();
router.get('/health', controllers_1.healthController);
router.post('/chat', controllers_1.chatController);
router.post('/program-finder', controllers_1.programFinderController);
router.post('/eligibility-check', controllers_1.eligibilityController);
exports.default = router;
//# sourceMappingURL=routes.js.map