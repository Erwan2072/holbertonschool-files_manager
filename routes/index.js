import express from 'express';
import UsersController from '../controllers/UsersController';

const router = express.Router();
router.post('/users', UsersController.postNew);
export default router;
