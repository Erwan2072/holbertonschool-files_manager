import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
const validFileTypes = ['folder', 'file', 'image'];

export default class FilesController {
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
      res.status(401).json({ error: 'Unauthorized' });
    }
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = new ObjectId(req.params.id);

    const userFiles = await dbClient.db.collection('files').findOne({ _id: fileId, userId: ObjectId(userId) });

    if (!userFiles) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).send(userFiles);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Vérifiez que la connexion à la base de données est établie
    if (!dbClient.isAlive()) {
      console.error('Database connection not available');
      return res.status(500).json({ error: 'Database connection failed' });
    }

    const parentId = req.query.parentId ? new ObjectId(req.query.parentId) : 0;
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = 20;

    const matchResult = { userId: ObjectId(userId) };
    if (parentId !== 0) {
      matchResult.parentId = parentId;
    }

    try {
      // Pagination with aggregate MongoDB
      const files = await dbClient.db.collection('files').aggregate([
        { $match: matchResult },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ]).toArray();
      return res.status(200).json(files);
    } catch (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }
  }
}
