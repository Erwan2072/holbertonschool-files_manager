// controllers/UsersController.js
import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';


const mime = require('mime-types');
const Queue = require('bull');

export default class FilesController {
  // Méthode pour gérer l'upload de fichiers
  static async postUpload(req, res) {
    // Vérification du token d'authentification dans les en-têtes de la requête
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Création de la clé Redis pour l'authentification
    const tokenKey = `auth_${token}`;
    // Récupération de l'identifiant de l'utilisateur à partir de Redis
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Récupération des informations du fichier depuis le corps de la requête
    const fileInfo = {
      userId,
      name: req.body.name,
      type: req.body.type,
      isPublic: (req.body.isPublic || false),
      parentId: req.body.parentId || 0,
    };

    if (fileInfo.name === undefined) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const validFileTypes = ['folder', 'file', 'image'];

    // Vérification que le type de fichier est valide
    if (fileInfo.type === undefined || !validFileTypes.includes(fileInfo.type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    // Vérification que les données du fichier sont présentes si ce n'est pas un dossier
    if (req.body.data === undefined && fileInfo.type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Vérification de l'existence et du type du dossier parent
    if (fileInfo.parentId !== 0) {
      const parentFile = await dbClient.findFileById(fileInfo.parentId);
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Création du fichier dans la base de données si c'est un dossier
    if (fileInfo.type === 'folder') {
      const id = await dbClient.createFile({ ...fileInfo });
      return res.status(201).json({ id, ...fileInfo });
    }

    // Création du répertoire pour stocker les fichiers si nécessaire
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    mkdirSync(folderPath, { recursive: true });

    // Création du chemin local pour le fichier en utilisant un UUID unique
    const localPath = path.join(folderPath, uuidv4());
    writeFileSync(localPath, req.body.data, { encoding: 'base64' });

    // Création du fichier dans la base de données avec le chemin local
    const id = await dbClient.createFile({ ...fileInfo, localPath });

    // Création d'une tache pour générer les miniature de l'image
    if (fileInfo.type === 'image') {
      const fileQueue = new Queue('fileQueue');
      fileQueue.add({ userId, fileId: id });
    }

    return res.status(201).json({ id, ...fileInfo });
  }

  // Méthode pour gérer la publication d'un fichier
  static async putPublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.findFileById(fileId, userId);

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }
    // Mise à jour du statut de publication du fichier
    const updatedFile = await dbClient.updateIsPublic(fileId, userId, true);
    return res.status(200).json(updatedFile);
  }

  // Méthode pour gérer la dépublication d'un fichier
  static async putUnpublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.findFileById(fileId, userId);

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }
    const updatedFile = await dbClient.updateIsPublic(fileId, userId, false);
    return res.status(200).json(updatedFile);
  }

  // Méthode pour récupérer les détails d'un fichier
  static async getShow(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await dbClient.findFileById(req.params.id, userId);
    if (!file) {
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

  // Méthode pour récupérer la liste des fichiers d'un utilisateur
  static async getIndex(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page || '0', 10);

    let files = await dbClient.getFilesForUser(userId, parentId, page);
    files = files.map((f) => ({
      id: f._id,
      userId: f.userId,
      name: f.name,
      type: f.type,
      isPublic: f.isPublic,
      parentId: f.parentId,
    }));
    return res.status(200).json(files);
  }

  // Méthode pour récupérer le contenu d'un fichier
  static async getFile(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'] || null;

    const fileId = req.params.id;

    const file = await dbClient.findFileById(fileId);

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    // Vérifier si le fichier est public
    if (!file.isPublic) {
      // Vérifier si l'utilisateur est authentifié et s'il est le propriétaire
      if (!userId || userId !== file.userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    const querySize = req.query.size;
    const validSizes = ['500', '250', '100'];

    if (querySize && validSizes.includes(querySize)) {
      file.localPath = `${file.localPath}_${querySize}`;
    }

    try {
      const data = readFileSync(file.localPath);
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      return res.set('Content-Type', mimeType).status(200).send(data);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}
