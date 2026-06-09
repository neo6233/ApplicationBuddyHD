import {Router} from 'express';
import {
  chatController,
  programFinderController,
  eligibilityController,
  healthController,
} from '../controllers/controllers';

const router = Router();

router.get('/health', healthController);
router.post('/chat', chatController);
router.post('/program-finder', programFinderController);
router.post('/eligibility-check', eligibilityController);

export default router;