import sha1 from 'sha1';
import redisClient from '../utils/redis';
import uuidv4 from 'uuid';
import dbClient from '../utils/db';

export default class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.header.authorization;

    if (!authHeader || !authHeader.startWith('Basic ')) {
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
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}
