// routes/index.js
import express from 'express';
import UsersController from '../controllers/UsersController';
import AppController from '../controllers/AppController';
import FilesController from '../controllers/FilesController';
// import AuthController from '../controllers/AuthController';

const router = express.Router();

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);
// router.get('/connect', AuthController.getConnect);
// router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UsersController.getMe);
router.post('/users', UsersController.postNew);
router.post('/files', FilesController.postUpload);

export default router;
