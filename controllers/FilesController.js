import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs, { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
const validFileTypes = ['folder', 'file', 'image'];

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !validFileTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

    let parentObjId = 0;
    if (parentId !== 0) {
      try {
        parentObjId = new ObjectId(parentId);
      } catch (err) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      const parent = await dbClient.db.collection('files').findOne({ _id: parentObjId });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileDocument = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? 0 : new ObjectId(parentId),
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(fileDocument);
      return res.status(201).json({
        id: result.insertedId,
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    }

    mkdirSync(folderPath, { recursive: true });
    const localPath = path.join(folderPath, uuidv4());
    writeFileSync(localPath, data, { encoding: 'base64' });

    fileDocument.localPath = localPath;

    const result = await dbClient.db.collection('files').insertOne(fileDocument);
    return res.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const fileId = new ObjectId(req.params.id);
      const userFiles = await dbClient.db.collection('files').findOne({
        _id: fileId,
        userId: new ObjectId(userId),
      });

      if (!userFiles) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json(userFiles);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!dbClient.isAlive()) {
      console.error('Database connection not available');
      return res.status(500).json({ error: 'Database connection failed' });
    }

    try {
      const parentIdParam = req.query.parentId;
      const page = parseInt(req.query.page, 10) || 0;
      const pageSize = 20;

      const matchQuery = { userId: new ObjectId(userId) };

      console.log('getIndex called');
      console.log('Token:', token);
      console.log('UserID:', userId);
      console.log('matchQuery:', matchQuery);

      if (!parentIdParam || parentIdParam === '0') {
        matchQuery.parentId = 0;
      } else {
        try {
          matchQuery.parentId = new ObjectId(parentIdParam);
        } catch (err) {
          return res.status(400).json({ error: 'Invalid parentId' });
        }
      }

      console.log('Running aggregate...');
      const files = await dbClient.db.collection('files').aggregate([
        { $match: matchQuery },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ]).toArray();

      return res.status(200).json(files);
    } catch (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const Key = `auth_${token}`;
    const userId = await redisClient.get(Key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });

    const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
    return res.status(200).json(updatedFile);
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const Key = `auth_${token}`;
    const userId = await redisClient.get(Key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });

    const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
    return res.status(200).json(updatedFile);
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    const fileId = req.params.id;

    try {
      const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!file.isPublic) {
        if (!token) return res.status(404).json({ error: 'Not found' });
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId || file.userId.toString() !== userId) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      if (!file.localPath || !fs.existsSync(file.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      const content = fs.readFileSync(file.localPath);
      return res.status(200).send(content);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
