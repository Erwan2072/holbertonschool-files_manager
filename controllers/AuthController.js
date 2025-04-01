import sha1 from 'sha1';
import redisClient from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';

export default class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const encoded = authHeader.split(' ')[1];

    let decoded;
    try {
      // Store and decode base64 data
      decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [email, password] = decoded.split(':');
    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const hashpwd = sha1(password);
    const usersCollection = await dbClient.db.collection('users');
    const user = await usersCollection.findOne({ email, password: hashpwd });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    const key = `auth_${token}`;
    const userId = String(user._id);

    await redisClient.set(key, userId, 24 * 60 * 60);

    return res.status(200).json({ "token": token });
  }

  static async getDisconnect (req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
    }

    const key = "auth_" + token;

    const user = await redisClient.get(key);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    await redisClient.del(key);

    return res.status(204).send();
  }
}
