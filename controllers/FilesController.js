import { v4 as uuidv4 } from 'uuid';
 import { writeFileSync, mkdirSync } from 'fs';
 import path from 'path';
 import redisClient from '../utils/redis';
 import dbClient from '../utils/db';

 class FilesController {
   static validFileTypes = ['folder', 'file', 'image'];

   static async postUpload(req, res) {
     const token = req.headers['x-token'];
     if (!token) {
       return res.status(401).json({ error: 'Unauthorized' });
     }

     const tokenKey = `auth_${token}`;
     const userId = await redisClient.get(tokenKey);

     if (!userId) {
       return res.status(401).json({ error: 'Unauthorized' });
     }

     const fileInfo = {
       userId,
       name: req.body.name,
       type: req.body.type,
       isPublic: (req.body.isPublic || 'false') === 'true',
       parentId: req.body.parentId || 0,
     }

     if (fileInfo.name === undefined) {
       return res.status(400).json({ error: 'Missing name' });
     }

     if (fileInfo.type === undefined || !FilesController.validFileTypes.includes(fileInfo.type)) {
       return res.status(400).json({ error: 'Missing type' });
     }

     if (req.body.data === undefined && fileInfo.type !== 'folder') {
       return res.status(400).json({ error: 'Missing data' });
     }

     if (fileInfo.parentId !== 0) {
       const parentFile = await dbClient.findFileById(fileInfo.parentId);
       if (!parentFile) {
         return res.status(400).json({ error: 'Parent not found' });
       }
       if (parentFile.type !== 'folder') {
         return res.status(400).json({ error: 'Parent is not a folder' });
       }
     }

     if (fileInfo.type === 'folder') {
       const id = await dbClient.createFile({ ...fileInfo });
       return res.status(201).json({ id, ...fileInfo });
     }

     const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
     mkdirSync(folderPath, { recursive: true });

     const localPath = path.join(folderPath, uuidv4());
     writeFileSync(localPath, req.body.data, {encoding: 'base64'});

     const id = await dbClient.createFile({...fileInfo, localPath });
     return res.status(201).json({ id, ...fileInfo });
   }
 }
 export default FilesController;
