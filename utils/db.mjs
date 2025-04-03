import mongodb from 'mongodb';

const { MongoClient } = mongodb;

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${host}:${port}`;
    MongoClient.connect(url, { useUnifiedTopology: true }, (error, client) => {
      this.db = client.db(database);
    });
  }

  isAlive() {
    if (this.db) {
      return true;
    }
    return false;
  }

  async nbUsers() {
    const users = this.db.collection('users');
    return users.countDocuments();
  }

  async nbFiles() {
    const files = this.db.collection('files');
    return files.countDocuments();
  }
}

const dbClient = new DBClient();
<<<<<<< HEAD

export default dbClient;
=======
export default dbClient;
export { ObjectId };
>>>>>>> Flo
