import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();

    this.client.on('error', (err) => {
      console.log(`Redis client not connected to the server: ${err}`);
    });
    // Promisification des méthodes Redis
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    try {
      const value = await this.getAsync(key);
      return value;
    } catch (err) {
      console.error('Error retrieve value:', err);
      return null;
    }
  }

  async set(key, value, duration) {
    try {
      // this key will expire after the duration explain in seconds
      await this.setAsync(key, value, 'EX', duration);
    } catch (err) {
      console.error('Error setting value:', err);
    }
  }

  async del(key) {
    try {
      await this.delAsync(key);
    } catch (err) {
      console.error('Error deleting value:', err);
    }
  }
}

const redisClient = new RedisClient();
export default redisClient;
