import { ObjectId } from 'mongodb';
import Queue from 'bull';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    // Get the user based on the token
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const _id = new ObjectId(userId);
    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verification of the request data
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    const fileTypes = ['folder', 'file', 'image'];
    if (!type || !fileTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }
    if (parentId) {
      const filesCollection = dbClient.db.collection('files');
      const parentIdObjectId = new ObjectId(parentId);
      const _idParent = await filesCollection.findOne({ _id: parentIdObjectId });
      if (!_idParent) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (_idParent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // If folder, add to database
    if (type === 'folder') {
      const filesCollection = dbClient.db.collection('files');
      const newFolder = {
        userId: user._id,
        name,
        type,
        parentId: parentId || 0,
        isPublic: isPublic || false,
      };
      await filesCollection.insertOne(newFolder);
      newFolder.id = newFolder._id;
      return res.status(201).json({
        id: newFolder.id,
        userId: user._id,
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
      });
    }

    // File creation
    const uuid = uuidv4();
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const filePath = `${folderPath}/${uuid}`;

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true }, (err) => {
        if (err) {
          console.error('A problem occured when creating the directory', err);
          res.status(500).end();
        }
      });
    }
    const decryptedData = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, decryptedData, (err) => {
      if (err) {
        console.error('A problem occured when creating the file', err);
        res.status(500).end();
      }
    });

    // File to database
    const newFile = {
      userId: user._id,
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
      localPath: filePath,
    };

    const filesCollection = dbClient.db.collection('files');
    await filesCollection.insertOne(newFile);
    newFile.id = newFile._id;

    // Add image to the Bull queue
    const fileQueue = new Queue('fileQueue');
    if (newFile.type === 'image') {
      console.log(`Adding job to queue for fileId: ${newFile.id}`);
      await fileQueue.add({ userId: newFile.userId, fileId: newFile.id });
    }

    return res.status(201).json({
      id: newFile.id,
      userId,
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = new ObjectId(req.params.id);
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: fileId });

    if (!file || userId !== file.userId.toString()) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { parentId = '0', page = 0 } = req.query;
    const userIdToFind = new ObjectId(userId);
    const skip = parseInt(page, 10) * 20;

    let match;

    if (parentId === '0') {
      match = { userId: userIdToFind };
    } else {
      match = {
        userId: userIdToFind,
        parentId,
      };
    }

    const filesCollection = dbClient.db.collection('files');
    const cursor = filesCollection.aggregate([
      { $match: match },
      { $skip: skip },
      { $limit: 20 },
    ]);
    const allFiles = await cursor.toArray();
    const jsonResponse = allFiles.map((file) => ({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    }));
    return res.status(200).json(jsonResponse);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = new ObjectId(req.params.id);
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: fileId, userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne({ _id: fileId }, { $set: { isPublic: true } });
    const updatedFile = await filesCollection.findOne({ _id: fileId });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = new ObjectId(req.params.id);
    const filesCollection = dbClient.db.collection('files');
    const file = await filesCollection.findOne({ _id: fileId, userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne({ _id: fileId }, { $set: { isPublic: false } });
    const updatedFile = await filesCollection.findOne({ _id: fileId });

    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId,
    });
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    const token = req.headers['x-token'];
    let userId = null;

    if (token) {
      userId = await redisClient.get(`auth_${token}`);
    }

    try {
      const fileId = new ObjectId(id);
      const filesCollection = dbClient.db.collection('files');
      const file = await filesCollection.findOne({ _id: fileId });

      if (!file) {
        console.log(`File with ID ${id} not found in database`);
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.isPublic === false) {
        if (!userId || file.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} is not authorized to access file with ID ${id}`);
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (file.type === 'folder') {
        console.log(`Requested file with ID ${id} is a folder`);
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      let filePath = file.localPath;
      if (size) {
        const validSizes = ['500', '250', '100'];
        if (!validSizes.includes(size)) {
          console.log(`Invalid size parameter: ${size}`);
          return res.status(400).json({ error: 'Invalid size parameter' });
        }
        const sizeFilePath = `${file.localPath}_${size}`;
        if (fs.existsSync(sizeFilePath)) {
          filePath = sizeFilePath;
        } else {
          console.log(`Resized file at path ${sizeFilePath} not found`);
          return res.status(404).json({ error: 'Not found' });
        }
      } else if (!fs.existsSync(filePath)) {
        console.log(`File at path ${filePath} not found`);
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name);
      res.setHeader('Content-Type', mimeType);
      const fileContent = fs.readFileSync(filePath);
      return res.status(200).send(fileContent); // Assurez-vous de retourner une réponse
    } catch (error) {
      console.error(`Error processing file with ID ${id}:`, error);
      return res.status(400).json({ error: 'Invalid file ID' }); // Assurez-vous de retourner une réponse en cas d'erreur
    }
  }
}

export default FilesController;
