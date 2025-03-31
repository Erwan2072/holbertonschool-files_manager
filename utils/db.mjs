// utils/db.mjs
import { MongoClient } from 'mongodb';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

class DBClient {
  constructor() {
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.db = null;
    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err);
      });
  }

  isAlive() {
    return !!this.db;
  }

  async nbUsers() {
    if (!this.db) return 0;
    const users = await this.db.collection('users').countDocuments();
    return users;
  }

  async nbFiles() {
    if (!this.db) return 0;
    const files = await this.db.collection('files').countDocuments();
    return files;
  }
}

const dbClient = new DBClient();
export default dbClient;
