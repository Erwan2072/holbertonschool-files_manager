import express from 'express';
import router from './routes/index';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use('/', router);

app.listen(port, () => {
  console.log(`Server connect to the port ${port}`);
});
