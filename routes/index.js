// routes/index.js
import express from 'express';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import AppController from '../controllers/AppController';
import FilesController from '../controllers/FilesController';

const router = express.Router();
router.use(express.json());

router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);
router.get('/users/me', UsersController.getMe);

router.post('/users', UsersController.postNew);
router.post('/files', FilesController.postUpload);

router.get('/files/:id', FilesController.getShow);
router.get('/files', FilesController.getIndex);

export default router;
