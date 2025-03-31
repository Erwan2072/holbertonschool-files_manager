// utils/db.mjs

import { MongoClient } from 'mongodb';

// Paramètres de connexion
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';

const url = `mongodb://${host}:${port}`;

class DBClient {
  constructor() {
    this.client = new MongoClient(url, { useUnifiedTopology: true });

    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err);
        this.db = null;
      });
  }

  isAlive() {
    return !!this.db;
  }

  async nbUsers() {
    return this.db?.collection('users')?.countDocuments() || 0;
  }

  async nbFiles() {
    return this.db?.collection('files')?.countDocuments() || 0;
  }
}

// Export de l’instance
const dbClient = new DBClient();
export default dbClient;
